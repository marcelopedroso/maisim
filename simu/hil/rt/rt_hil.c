/* HIL em tempo real dentro de uma placa só (o Raspberry Pi): a planta num núcleo e o controle em outro, sem rede nem Gecko.
   Duas threads, cada uma fixa num núcleo (e em SCHED_FIFO, se der), as duas presas ao mesmo relógio (CLOCK_MONOTONIC, o
   contador de 19,2 MHz do ARM) e esperando o instante do próximo passo girando no relógio (sem dormir: um sleep devolve o
   núcleo ao escalonador e traz o jitter de volta).

     planta  (núcleo --core-planta, passo --dt-us): i' = a·i + (1-a)·g·Vdc/R, a = exp(-R·dt/L): a RL do buck do
                exemplo_controle_pwm, exata com a chave parada no passo. Lê o g mais recente e publica o i e o índice do passo.
     controle (núcleo --core-ctl, período --ts-us): o MESMO controle.c do SIL (maisim_controle.h), sem calço: lê o i
                publicado, chama maisim_passo e publica o g. Um passo que passa do próximo instante (overrun) perde as
                amostras seguintes que já venceram, como a ISR de um microcontrolador que não deu conta: elas são contadas.

   O tempo de simulação é o tempo real (t = (amostra no cenário) · Ts, como no Gecko); o cenário do exemplo (10 ms, i_ref
   10 → 15 A em 5 ms → 8 A em 7,5 ms) repete --runs vezes. Cada amostra do controle grava: atraso do início em relação ao
   instante previsto, tempo de execução, idade da medida (do passo da planta que ele leu), amostras perdidas, i e g. */
#define _GNU_SOURCE
#include <errno.h>
#include <math.h>
#include <pthread.h>
#include <sched.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <time.h>
#include "maisim_controle.h"
#include "rt_params.h"

/* o alvo não tem Scope nem rede entre controladores */
void maisim_scope(const char *n, maisim_real v) { (void)n; (void)v; }
void maisim_padrao(int u, int o, maisim_real v) { (void)u; (void)o; (void)v; }   /* o pulso do pwm_pulsos: aqui não há (o PWM é da planta) */
void maisim_envia(const char *a, const char *b, maisim_real v) { (void)a; (void)b; (void)v; }
int maisim_recebeu(const char *a, const char *b, maisim_real *v) { (void)a; (void)b; (void)v; return 0; }

static inline int64_t agora(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (int64_t)t.tv_sec * 1000000000LL + t.tv_nsec;
}

typedef struct { int32_t idx, atraso, exec, idade; float i, g; } Reg;

static struct {
    int core_ctl, core_planta, prio, runs;
    int64_t ts_ns, dt_ns, run_ns;
    double L;
    int vazio;                                 /* o controle não chama o maisim_passo (só o relógio): o piso do jitter */
} C = {2, 3, 80, 200, 10000, 1000, 10000000, 1e-3, 0};

static atomic_int go;
static int64_t T0;
static struct { _Atomic double i; char p0[56]; _Atomic double g; char p1[56]; _Atomic int64_t k; } sh;   /* uma linha de cache cada */
static int fifo_ok[2];

static struct { int64_t max, n1us, n10us, n100us, n1ms, total, passos_seguidos_max; } PL;
static Reg *reg;
static int64_t n_reg, amostras_total, perdidas, execs_acima_ts, runs_feitas;

static void fixa(int core, int idx, const char *nome) {
    cpu_set_t s;
    CPU_ZERO(&s);
    CPU_SET(core, &s);
    int r = pthread_setaffinity_np(pthread_self(), sizeof s, &s);
    if (r) fprintf(stderr, "%s: sem afinidade ao núcleo %d (%s)\n", nome, core, strerror(r));
    if (C.prio > 0) {
        struct sched_param sp = {.sched_priority = C.prio};
        r = pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);
        if (r) fprintf(stderr, "%s: sem SCHED_FIFO (%s); segue no escalonador normal\n", nome, strerror(r));
        else fifo_ok[idx] = 1;
    }
}

static void *planta(void *arg) {
    (void)arg;
    fixa(C.core_planta, 0, "planta");
    const int64_t dt = C.dt_ns, por_run = C.run_ns / dt, total = por_run * C.runs;
    const double a = exp(-P_INICIAL[P_R] * (dt * 1e-9) / C.L), b = (1.0 - a) * P_INICIAL[P_Vdc] / P_INICIAL[P_R];
    double i = 0.0;
    while (!atomic_load(&go)) ;
    for (int64_t k = 0; k < total; k++) {
        int64_t prev = T0 + k * dt, t;
        while ((t = agora()) < prev) ;
        int64_t atraso = t - prev;
        if (atraso > PL.max) PL.max = atraso;
        PL.n1us += atraso > 1000; PL.n10us += atraso > 10000; PL.n100us += atraso > 100000; PL.n1ms += atraso > 1000000;
        if (k % por_run == 0) i = 0.0;
        i = a * i + b * atomic_load_explicit(&sh.g, memory_order_acquire);
        atomic_store_explicit(&sh.i, i, memory_order_release);
        atomic_store_explicit(&sh.k, k, memory_order_release);
    }
    PL.total = total;
    return NULL;
}

static void *controle(void *arg) {
    (void)arg;
    fixa(C.core_ctl, 1, "controle");
    const int64_t Ts = C.ts_ns, S = C.run_ns / Ts, total = S * C.runs;
    size_t n = maisim_tamanho_estado();
    void *estado = calloc(1, n + 16);
    maisim_real p[MAISIM_N_P], m[MAISIM_N_M], u[MAISIM_N_U];
    int run_atual = -1, ev = 0;
    while (!atomic_load(&go)) ;
    int64_t idx = 0;
    while (idx < total) {
        int64_t prev = T0 + idx * Ts, t;
        while ((t = agora()) < prev) ;
        int run = (int)(idx / S);
        int64_t j = idx % S;
        double t_sim = (double)j * (double)Ts * 1e-9;
        if (run != run_atual) {                      /* o cenário recomeça: parâmetros, estado e a chave aberta (fora da medida) */
            memcpy(p, P_INICIAL, sizeof p);
            memset(estado, 0, n + 16);
            maisim_iniciar(p, estado);
            atomic_store_explicit(&sh.g, 0.0, memory_order_release);
            run_atual = run; ev = 0; runs_feitas++;
            t = agora();
        }
        while (ev < (int)(sizeof EVENTOS / sizeof EVENTOS[0]) && t_sim >= EVENTOS[ev].t) { p[EVENTOS[ev].idx] = EVENTOS[ev].v; ev++; }
        int64_t t0 = agora();
        m[M_i_L] = atomic_load_explicit(&sh.i, memory_order_acquire);
        int64_t kp = atomic_load_explicit(&sh.k, memory_order_acquire);
        u[U_g] = NAN;
        if (!C.vazio) maisim_passo(t_sim, m, p, estado, u);
        if (!isnan(u[U_g])) atomic_store_explicit(&sh.g, u[U_g], memory_order_release);
        int64_t t1 = agora();
        Reg *r = &reg[n_reg++];
        r->idx = (int32_t)idx; r->atraso = (int32_t)(t0 - prev); r->exec = (int32_t)(t1 - t0);
        r->idade = (int32_t)(t0 - (T0 + kp * C.dt_ns)); r->i = (float)m[M_i_L]; r->g = (float)sh.g;
        if (t1 - t0 > Ts) execs_acima_ts++;
        int64_t prox = idx + 1;
        while (prox < total && T0 + prox * Ts < t1) prox++;     /* as amostras que venceram durante este passo se perdem */
        perdidas += prox - idx - 1;
        idx = prox;
    }
    amostras_total = total;
    free(estado);
    return NULL;
}

int main(int argc, char **argv) {
    const char *saida = "rt_hil.bin";
    for (int a = 1; a < argc; a++) {
        const char *k = argv[a], *v = a + 1 < argc ? argv[a + 1] : "";
        if (!strcmp(k, "--ts-us")) C.ts_ns = (int64_t)(atof(v) * 1000), a++;
        else if (!strcmp(k, "--dt-us")) C.dt_ns = (int64_t)(atof(v) * 1000), a++;
        else if (!strcmp(k, "--runs")) C.runs = atoi(v), a++;
        else if (!strcmp(k, "--core-ctl")) C.core_ctl = atoi(v), a++;
        else if (!strcmp(k, "--core-planta")) C.core_planta = atoi(v), a++;
        else if (!strcmp(k, "--prio")) C.prio = atoi(v), a++;
        else if (!strcmp(k, "--L")) C.L = atof(v), a++;
        else if (!strcmp(k, "--out")) saida = v, a++;
        else if (!strcmp(k, "--vazio")) C.vazio = 1;
        else { fprintf(stderr, "opção desconhecida: %s\n", k); return 2; }
    }
    if (C.run_ns % C.ts_ns || C.run_ns % C.dt_ns) { fprintf(stderr, "Ts e dt têm de dividir 10 ms\n"); return 2; }
    int64_t S = C.run_ns / C.ts_ns, total = S * C.runs;
    reg = calloc((size_t)total, sizeof(Reg));
    if (!reg) return 3;
    memset(reg, 0, (size_t)total * sizeof(Reg));      /* as páginas do registro já tocadas: sem page fault no laço */
    pthread_t tp, tc;
    int er = pthread_create(&tp, NULL, planta, NULL);
    if (!er) er = pthread_create(&tc, NULL, controle, NULL);
    if (er) { fprintf(stderr, "pthread_create: %s\n", strerror(er)); return 5; }
    if (mlockall(MCL_CURRENT)) fprintf(stderr, "sem mlockall (precisa de root ou de ulimit -l maior): %s\n", strerror(errno));
    struct timespec dorme = {0, 200000000};
    nanosleep(&dorme, NULL);                         /* as duas já fixas nos núcleos e esperando o go */
    T0 = agora() + 100000000;
    atomic_store(&go, 1);
    pthread_join(tp, NULL);
    pthread_join(tc, NULL);
    FILE *f = fopen(saida, "wb");
    if (!f) { perror(saida); return 4; }
    int64_t h[6] = {n_reg, C.ts_ns, C.dt_ns, S, C.runs, C.vazio};
    fwrite(h, sizeof h, 1, f);
    fwrite(reg, sizeof(Reg), (size_t)n_reg, f);
    fclose(f);
    printf("{\"ts_us\":%.3f,\"dt_us\":%.3f,\"runs\":%d,\"amostras\":%lld,\"executadas\":%lld,\"perdidas\":%lld,\"exec_acima_ts\":%lld,"
           "\"fifo\":[%d,%d],\"planta\":{\"passos\":%lld,\"max_atraso_us\":%.1f,\"gt1us\":%lld,\"gt10us\":%lld,\"gt100us\":%lld,\"gt1ms\":%lld}}\n",
           C.ts_ns / 1e3, C.dt_ns / 1e3, C.runs, (long long)amostras_total, (long long)n_reg, (long long)perdidas, (long long)execs_acima_ts,
           fifo_ok[0], fifo_ok[1], (long long)PL.total, PL.max / 1e3, (long long)PL.n1us, (long long)PL.n10us, (long long)PL.n100us,
           (long long)PL.n1ms);
    return 0;
}
