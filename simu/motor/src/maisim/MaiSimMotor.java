package maisim;

import ch.technokrat.gecko.GeckoRemoteInterface;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.rmi.registry.LocateRegistry;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Motor do editor do MaiSim: liga a interface web ao GeckoCIRCUITS (o "cérebro") pela interface remota (RMI) do próprio
 * Gecko, para criar, apagar, mover, girar, parametrizar, rotular e salvar componentes; quem grava o .ipes é o Gecko.
 * CREATE nome x y tipo (tipo no fim, pode ter espaço); PARAMS devolve as entradas separadas por "||".
 * Protocolo de linhas (igual em espírito à gecko-bridge da co-simulação, mas separado dela): um pedido por linha,
 * resposta "OK …" ou "ERR …". Escuta só em 127.0.0.1. Os textos dos erros (ERR) são em inglês, como os do próprio Gecko
 * e do Java, que chegam pelo mesmo caminho: o servidor os mostra como vieram, em qualquer idioma da página. A linha
 * "… ouvindo em …" do início é o sinal de pronto que o gecko/sobe.sh e o simu/validacao/sobe_teste.sh procuram no registro.
 *
 * uso: java -cp gecko.jar:bin maisim.MaiSimMotor [--gecko-port 7103] [--porta 7104]   (as portas de config/padrao.env)
 */
public final class MaiSimMotor {
    private GeckoRemoteInterface g;
    private final int portaGecko;

    private MaiSimMotor(GeckoRemoteInterface g, int portaGecko) { this.g = g; this.portaGecko = portaGecko; }

    /** O Gecko caiu ou é outro (a referência remota velha só dá RemoteException): procura de novo no registro da porta.
     *  O comando que falhou volta com o ERR dele; o servidor vê o java.rmi, confere o Gecko (o novo é reconhecido) e repete. */
    private void reconecta() {
        try {
            GeckoRemoteInterface n = (GeckoRemoteInterface) LocateRegistry.getRegistry("localhost", portaGecko).lookup("GeckoRemoteInterface");
            n.connect();
            g = n;
            // um Gecko novo: talvez já com o jar dos patches (0005 média, 0008 lote, 0009 estado inicial, 0010 STEPC):
            // as marcas de "sem o patch" do Gecko anterior não valem mais
            geckoSemMedia = false; geckoSemLote = false; geckoSemInicial = false; geckoSemStepc = false;
        } catch (Exception e) { System.out.println("reconectar ao Gecko: " + e); }
    }

    public static void main(String[] args) throws Exception {
        int portaGecko = 7103, porta = 7104;
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals("--gecko-port")) portaGecko = Integer.parseInt(args[++i]);
            else if (args[i].equals("--porta")) porta = Integer.parseInt(args[++i]);
        }
        GeckoRemoteInterface g = (GeckoRemoteInterface) LocateRegistry.getRegistry("localhost", portaGecko).lookup("GeckoRemoteInterface");
        g.connect();
        MaiSimMotor m = new MaiSimMotor(g, portaGecko);
        try (ServerSocket ss = new ServerSocket(porta, 10, InetAddress.getByName("127.0.0.1"))) {
            System.out.println("MaiSimMotor: Gecko na porta " + portaGecko + ", ouvindo em 127.0.0.1:" + porta);
            while (true) {
                try (Socket s = ss.accept();
                     BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                     PrintWriter out = new PrintWriter(s.getOutputStream(), true)) {
                    String linha;
                    while ((linha = in.readLine()) != null) {
                        String r;
                        try { r = "OK " + m.trata(linha.trim()); }
                        catch (Throwable e) {
                            Throwable c = e.getCause() != null ? e.getCause() : e;
                            Throwable rmi = e instanceof java.rmi.RemoteException ? e : c instanceof java.rmi.RemoteException ? c : null;
                            if (rmi != null) m.reconecta();       // e o ERR diz java.rmi… (o servidor reconhece o Gecko caído/novo)
                            r = "ERR " + String.valueOf(rmi != null ? rmi : c).replace('\n', ' ');
                        }
                        out.println(r);
                        if (linha.trim().equals("QUIT")) break;
                    }
                } catch (Exception e) { System.out.println("cliente: " + e); }
            }
        }
    }

    /** O resto da linha depois de n palavras (para caminhos de arquivo com espaço). */
    private static String resto(String linha, int n) {
        String s = linha;
        for (int i = 0; i < n; i++) s = s.substring(s.indexOf(' ') + 1);
        return s;
    }

    /** STEP n lendo os nomes depois de CADA passo: "t m1 m2 …", as médias dos n passos (a perda de chaveamento E/Δt dura um
     *  passo só: a leitura de um ponto por bloco quase nunca a pega). No Gecko (patch 0005, simulateStepsAveraged: o laço
     *  dentro dele, sem uma ida e volta por passo); pela reflexão, para o motor compilar também com um jar sem o patch — e
     *  aí, o mesmo laço daqui (um STEP 1 + GETM por passo: certo, só mais lento). O Gecko é outro processo: com o jar novo e um
     *  Gecko ainda do jar velho (refeito sem reiniciar), a interface daqui tem o método e a dele não — o RMI recusa antes de
     *  andar ("unrecognized method hash"), e daí em diante vale o laço daqui (geckoSemMedia), em vez de toda rodada falhar. */
    private boolean geckoSemMedia = false;

    private static boolean metodoDesconhecido(Throwable c) {   // só esse texto: um UnmarshalException da volta (o Gecko já andou)
        for (; c != null; c = c.getCause())                      // não pode virar "faz os passos de novo"
            if (String.valueOf(c.getMessage()).contains("unrecognized method hash")) return true;
        return false;
    }

    private String stepMedia(int n, String[] nomes) throws Exception {
        double[] r = null;
        java.lang.reflect.Method mm = null;
        if (!geckoSemMedia) {
            try { mm = GeckoRemoteInterface.class.getMethod("simulateStepsAveraged", int.class, String[].class); }
            catch (NoSuchMethodException semPatch) { }
        }
        if (mm != null) {
            try { r = (double[]) mm.invoke(g, n, (Object) nomes); }
            catch (java.lang.reflect.InvocationTargetException e) {
                if (!metodoDesconhecido(e.getCause())) throw e.getCause() instanceof Exception ? (Exception) e.getCause() : e;
                geckoSemMedia = true;                                        // o Gecko não andou: o laço daqui faz os n passos
                System.err.println("Gecko sem simulateStepsAveraged (jar velho no ar): a média por passo pelo laço do motor");
            }
        }
        if (r == null) {
            r = new double[nomes.length + 1];
            for (int k = 0; k < n; k++) {
                g.simulateSteps(1);
                String[] v = trata("GETM " + String.join(" ", nomes)).split(" ");
                for (int i = 0; i < nomes.length; i++) r[i] += Double.parseDouble(v[i]);
            }
            for (int i = 0; i < nomes.length; i++) r[i] = n > 0 ? r[i] / n : 0.0;
            r[nomes.length] = g.getSimulationTime();
        }
        StringBuilder sb = new StringBuilder(Double.toString(r[nomes.length]));
        for (int i = 0; i < nomes.length; i++) sb.append(' ').append(r[i]);
        return sb.toString();
    }

    /** STEPS m q np ponto… na média… → "r" e r registros "t feitos ponto… média…": q amostras de m passos numa chamada só
     *  (patch 0008, simulateStepsSampled; a rodada sem controle em Python manda blocos de amostras, em vez de um STEP e um
     *  GETM — dois saltos até o Gecko — por amostra). Os mesmos passos, leituras e médias do STEP/STEPA + GETM. Sem o método
     *  (o motor compilado com um jar sem o patch, ou um Gecko ainda do jar velho: o RMI recusa antes de andar), responde o
     *  erro "SEM_LOTE" e o servidor segue amostra a amostra, como antes. */
    private boolean geckoSemLote = false;

    private String stepAmostras(String[] p) throws Exception {
        int m = Integer.parseInt(p[1]), q = Integer.parseInt(p[2]), np = Integer.parseInt(p[3]);
        String[] pontos = Arrays.copyOfRange(p, 4, 4 + np);
        int na = Integer.parseInt(p[4 + np]);
        String[] medias = Arrays.copyOfRange(p, 5 + np, 5 + np + na);
        if (p.length != 5 + np + na) throw new IllegalArgumentException("STEPS m q np point… na average…: wrong count");
        java.lang.reflect.Method mm = null;
        if (!geckoSemLote) {
            try { mm = GeckoRemoteInterface.class.getMethod("simulateStepsSampled", int.class, int.class, String[].class, String[].class); }
            catch (NoSuchMethodException semPatch) { }
        }
        if (mm == null) throw new IllegalStateException("SEM_LOTE");
        double[] r;
        try { r = (double[]) mm.invoke(g, m, q, (Object) pontos, (Object) medias); }
        catch (java.lang.reflect.InvocationTargetException e) {
            if (!metodoDesconhecido(e.getCause())) throw e.getCause() instanceof Exception ? (Exception) e.getCause() : e;
            geckoSemLote = true;                                             // o Gecko não andou
            throw new IllegalStateException("SEM_LOTE");
        }
        int w = 2 + np + na, regs = r.length / w;
        StringBuilder sb = new StringBuilder(Integer.toString(regs));
        for (int i = 0; i < regs * w; i++) {
            if (i % w == 1) sb.append(' ').append((int) r[i]);              // os passos feitos: inteiro
            else sb.append(' ').append(r[i]);                                  // como o STEP/STEPA/GETM (Double.toString)
        }
        return sb.toString();
    }

    /** INICIAL nome… → os valores em t = 0 (patch 0009, initialOutputs): depois do INIT e sem passo nenhum, o estado inicial
     *  do circuito com as condições iniciais dele (as tensões e temperaturas que o Gecko resolve no INIT a partir de uC(0),
     *  Temp(0)…, a máquina como começa, o y0 de um integrador). O servidor dá INIT de novo antes de andar. Sem o método,
     *  o erro "SEM_INICIAL" (o servidor volta ao passo de prova de antes). */
    private boolean geckoSemInicial = false;

    private String inicial(String[] nomes) throws Exception {
        java.lang.reflect.Method mm = null;
        if (!geckoSemInicial) {
            try { mm = GeckoRemoteInterface.class.getMethod("initialOutputs", String[].class); }
            catch (NoSuchMethodException semPatch) { }
        }
        if (mm == null) throw new IllegalStateException("SEM_INICIAL");
        double[] v;
        try { v = (double[]) mm.invoke(g, (Object) nomes); }
        catch (java.lang.reflect.InvocationTargetException e) {
            if (!metodoDesconhecido(e.getCause())) throw e.getCause() instanceof Exception ? (Exception) e.getCause() : e;
            geckoSemInicial = true;
            throw new IllegalStateException("SEM_INICIAL");
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < v.length; i++) sb.append(i > 0 ? " " : "").append(v[i]);   // como o GETM
        return sb.toString();
    }

    /** PREP np ponto… na média… nc const… e STEPC n nw (deslocamento índice valor)… → um período de amostragem do controle em
     *  Python numa chamada só (patch 0010: prepareControlSteps / stepControl): as escritas nos CONST (índices do PREP)
     *  antes dos passos certos, os trechos entre elas como o STEP/STEPA, e a leitura do GETM no fim. Resposta do STEPC:
     *  "ntrechos" e, para cada trecho, "t feitos média…", e depois os valores dos pontos. Sem os métodos (jar sem o patch ou
     *  um Gecko ainda do jar velho), o erro "SEM_STEPC" e o servidor segue com STEP, SETM e GETM separados, como antes. */
    private boolean geckoSemStepc = false;

    private java.lang.reflect.Method metodoStepc(String nome, Class<?>... tipos) {
        if (geckoSemStepc) return null;
        try { return GeckoRemoteInterface.class.getMethod(nome, tipos); }
        catch (NoSuchMethodException semPatch) { return null; }
    }

    private Object chamaStepc(java.lang.reflect.Method mm, Object... args) throws Exception {
        if (mm == null) throw new IllegalStateException("SEM_STEPC");
        try { return mm.invoke(g, args); }
        catch (java.lang.reflect.InvocationTargetException e) {
            if (!metodoDesconhecido(e.getCause())) throw e.getCause() instanceof Exception ? (Exception) e.getCause() : e;
            geckoSemStepc = true;                                            // o Gecko não fez nada
            throw new IllegalStateException("SEM_STEPC");
        }
    }

    private String prepara(String[] p) throws Exception {
        int np = Integer.parseInt(p[1]);
        String[] pontos = Arrays.copyOfRange(p, 2, 2 + np);
        int na = Integer.parseInt(p[2 + np]);
        String[] medias = Arrays.copyOfRange(p, 3 + np, 3 + np + na);
        int nc = Integer.parseInt(p[3 + np + na]);
        String[] consts = Arrays.copyOfRange(p, 4 + np + na, 4 + np + na + nc);
        if (p.length != 4 + np + na + nc) throw new IllegalArgumentException("PREP np point… na average… nc const…: wrong count");
        chamaStepc(metodoStepc("prepareControlSteps", String[].class, String[].class, String[].class), (Object) pontos, (Object) medias, (Object) consts);
        return "";
    }

    private String passoControle(String[] p) throws Exception {
        int n = Integer.parseInt(p[1]), nw = Integer.parseInt(p[2]);
        if (p.length != 3 + 3 * nw) throw new IllegalArgumentException("STEPC n nw (offset index value)…: wrong count");
        int[] desl = new int[nw], idx = new int[nw];
        double[] val = new double[nw];
        for (int w = 0; w < nw; w++) {
            desl[w] = Integer.parseInt(p[3 + 3 * w]);
            idx[w] = Integer.parseInt(p[4 + 3 * w]);
            val[w] = Double.parseDouble(p[5 + 3 * w]);                      // como o SETM
        }
        double[] r = (double[]) chamaStepc(metodoStepc("stepControl", int.class, int[].class, int[].class, double[].class), n, desl, idx, val);
        StringBuilder sb = new StringBuilder(Integer.toString((int) r[0]));
        for (int i = 1; i < r.length; i++) sb.append(' ').append(r[i]);   // Double.toString, como o STEP/STEPA/GETM
        return sb.toString();
    }

    /** STEPCS k n nw (deslocamento índice valor)… → o STEPC com as amostras de dentro do Ts (patch 0011,
     *  stepControlSampled): a cada k passos, o tempo, o passo, os pontos e as médias desde a amostra anterior. Resposta: a
     *  do STEPC, depois "namostras", as amostras e "passos_da_cauda médias…" (o que veio depois da última). Sem o método,
     *  "SEM_STEPCS" (o servidor grava só no instante do Ts, como antes). k = 0 e n = 0: só confere se o Gecko tem o patch. */
    private boolean geckoSemStepcs = false;

    private String passoControleAmostrado(String[] p) throws Exception {
        int k = Integer.parseInt(p[1]), n = Integer.parseInt(p[2]), nw = Integer.parseInt(p[3]);
        if (p.length != 4 + 3 * nw) throw new IllegalArgumentException("STEPCS k n nw (offset index value)…: wrong count");
        int[] desl = new int[nw], idx = new int[nw];
        double[] val = new double[nw];
        for (int w = 0; w < nw; w++) {
            desl[w] = Integer.parseInt(p[4 + 3 * w]);
            idx[w] = Integer.parseInt(p[5 + 3 * w]);
            val[w] = Double.parseDouble(p[6 + 3 * w]);
        }
        java.lang.reflect.Method mm = null;
        if (!geckoSemStepcs) {
            try { mm = GeckoRemoteInterface.class.getMethod("stepControlSampled", int.class, int[].class, int[].class, double[].class, int.class); }
            catch (NoSuchMethodException semPatch) { }
        }
        if (mm == null) throw new IllegalStateException("SEM_STEPCS");
        double[] r;
        try { r = (double[]) mm.invoke(g, n, desl, idx, val, k); }
        catch (java.lang.reflect.InvocationTargetException e) {
            if (!metodoDesconhecido(e.getCause())) throw e.getCause() instanceof Exception ? (Exception) e.getCause() : e;
            geckoSemStepcs = true;
            throw new IllegalStateException("SEM_STEPCS");
        }
        StringBuilder sb = new StringBuilder(Integer.toString((int) r[0]));
        for (int i = 1; i < r.length; i++) sb.append(' ').append(r[i]);   // Double.toString, como o STEPC
        return sb.toString();
    }

    private String trata(String linha) throws Exception {
        String[] p = linha.split("\\s+");
        switch (p[0]) {
            case "PING": return "PONG";
            case "QUIT": return "BYE";
            case "OPEN": g.openFile(resto(linha, 1)); return "";
            case "SAVEAS": g.saveFileAs(resto(linha, 1)); return "";
            case "CREATE": g.createComponent(resto(linha, 4), p[1], Integer.parseInt(p[2]), Integer.parseInt(p[3])); return "";  // CREATE nome x y tipo (o tipo pode ter espaço, ex. "C DLL")
            case "DELETE": g.deleteComponent(p[1]); return "";
            case "MOVE": g.setPosition(p[1], Integer.parseInt(p[2]), Integer.parseInt(p[3])); return "";
            case "POS": { int[] q = g.getPosition(p[1]); return q[0] + " " + q[1]; }
            case "ROTATE": g.rotate(p[1]); return "";
            case "ORIENT": g.setOrientation(p[1], p[2]); return "";
            case "RENAME": g.setComponentName(p[1], p[2]); return "";
            case "PARAMS": return String.join("||", g.getParametersNames(p[1]));          // cada um: nome \t\t unidade \t descrição
            case "ACCPARAMS": return String.join("||", g.getAccessibleParameters(p[1]));
            case "GETP": return Double.toString(g.getParameter(p[1], p[2]));
            case "SETP": g.setParameter(p[1], p[2], Double.parseDouble(p[3])); return "";
            case "GETG": return Double.toString(g.getGlobalParameterValue(p[1]));
            case "SETG": g.setGlobalParameterValue(p[1], Double.parseDouble(p[2])); return "";
            case "INNODE": g.setInputNodeName(p[1], Integer.parseInt(p[2]), p.length > 3 ? p[3] : ""); return "";
            case "OUTNODE": g.setOutputNodeName(p[1], Integer.parseInt(p[2]), p.length > 3 ? p[3] : ""); return "";
            case "GETIN": return g.getInputNodeName(p[1], Integer.parseInt(p[2]));
            case "GETOUT": return g.getOutputNodeName(p[1], Integer.parseInt(p[2]));
            case "LIST": return String.join(" ", g.getCircuitElements()) + " | " + String.join(" ", g.getControlElements());
            case "SHEET": { int[] q = g.getWorksheetSize(); return q[0] + " " + q[1]; }
            case "CLEAR": g.deleteAllComponents(null); return "";                    // folha em branco (como arquivo novo)
            case "INIT": g.initSimulation(Double.parseDouble(p[1]), Double.parseDouble(p[2])); return "";   // INIT dt tfim
            case "STEP": g.simulateSteps(Integer.parseInt(p[1])); return Double.toString(g.getSimulationTime());
            case "STEPA": return stepMedia(Integer.parseInt(p[1]), Arrays.copyOfRange(p, 2, p.length));   // STEPA n nome… → t médias
            case "STEPS": return stepAmostras(p);                                    // STEPS m q np ponto… na média… → r registros
            case "INICIAL": return inicial(Arrays.copyOfRange(p, 1, p.length));      // INICIAL nome… → os valores em t = 0
            case "PREP": return prepara(p);                                          // PREP np ponto… na média… nc const…
            case "STEPC": return passoControle(p);                                   // STEPC n nw (desl. índice valor)… → trechos e pontos
            case "STEPCS": return passoControleAmostrado(p);                         // STEPCS k n nw (desl. índice valor)… → o STEPC e as amostras de dentro
            case "TIME": return Double.toString(g.getSimulationTime());
            case "END": g.endSimulation(); return "";
            case "GET": return Double.toString(g.getOutput(p[1]));
            case "GETM": {                                                           // GETM nome1 nome2 bloco@saída … → valores
                String[] nomes = Arrays.copyOfRange(p, 1, p.length);
                double[] v = new double[nomes.length];
                List<Integer> simples = new ArrayList<>();                           // os de uma saída só: numa chamada
                for (int i = 0; i < nomes.length; i++) {
                    int a = nomes[i].lastIndexOf('@');                               // bloco com várias saídas: a saída pelo nome
                    if (a > 0) v[i] = g.getOutput(nomes[i].substring(0, a), nomes[i].substring(a + 1));
                    else simples.add(i);
                }
                String[] ss = new String[simples.size()];
                for (int k = 0; k < ss.length; k++) ss[k] = nomes[simples.get(k)];
                double[] vs;
                try {
                    vs = ss.length > 0 ? g.getOutputs(ss) : new double[0];            // uma chamada (jar com a leitura em lote)
                } catch (Throwable semLote) {                                        // jar antigo: uma por nome
                    vs = new double[ss.length];
                    for (int k = 0; k < ss.length; k++) vs[k] = g.getOutput(ss[k]);
                }
                for (int k = 0; k < ss.length; k++) v[simples.get(k)] = vs[k];
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < v.length; i++) sb.append(i > 0 ? " " : "").append(v[i]);
                return sb.toString();
            }
            case "SETM": {                                                           // SETM nome:parâmetro:valor … (a atuação do controle)
                int n = p.length - 1;
                String[] nomes = new String[n], pars = new String[n];
                double[] v = new double[n];
                for (int i = 0; i < n; i++) {
                    String[] q = p[i + 1].split(":");
                    if (q.length != 3) throw new IllegalArgumentException("SETM expects name:parameter:value, got " + p[i + 1]);
                    nomes[i] = q[0]; pars[i] = q[1]; v[i] = Double.parseDouble(q[2]);
                }
                try {
                    g.setParameterMany(nomes, pars, v);
                } catch (Throwable semLote) {
                    for (int i = 0; i < n; i++) g.setParameter(nomes[i], pars[i], v[i]);
                }
                return "";
            }
            default: throw new IllegalArgumentException("unknown command: " + p[0] + " (commands: " + Arrays.toString(
                    new String[]{"PING", "OPEN", "SAVEAS", "CREATE", "DELETE", "MOVE", "POS", "ROTATE", "ORIENT", "RENAME", "PARAMS",
                            "ACCPARAMS", "GETP", "SETP", "GETG", "SETG", "INNODE", "OUTNODE", "GETIN", "GETOUT", "LIST", "SHEET", "CLEAR", "INIT", "STEP", "STEPA", "STEPS", "INICIAL", "PREP", "STEPC", "STEPCS", "TIME", "END", "GET", "GETM", "SETM", "QUIT"}) + ")");
        }
    }
}
