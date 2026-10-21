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
import java.util.Arrays;

/**
 * Motor do editor do MaiSim: liga a interface web ao GeckoCIRCUITS (o "cérebro") pela interface remota (RMI) do próprio
 * Gecko, para criar, apagar, mover, girar, parametrizar, rotular e salvar componentes; quem grava o .ipes é o Gecko.
 * CREATE nome x y tipo (tipo no fim, pode ter espaço); PARAMS devolve as entradas separadas por "||".
 * Protocolo de linhas (igual em espírito à gecko-bridge da co-simulação, mas separado dela): um pedido por linha,
 * resposta "OK …" ou "ERR …". Escuta só em 127.0.0.1.
 *
 * uso: java -cp gecko.jar:bin maisim.MaiSimMotor [--gecko-port 7103] [--porta 7104]   (as portas de config/padrao.env)
 */
public final class MaiSimMotor {
    private final GeckoRemoteInterface g;

    private MaiSimMotor(GeckoRemoteInterface g) { this.g = g; }

    public static void main(String[] args) throws Exception {
        int portaGecko = 7103, porta = 7104;
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals("--gecko-port")) portaGecko = Integer.parseInt(args[++i]);
            else if (args[i].equals("--porta")) porta = Integer.parseInt(args[++i]);
        }
        GeckoRemoteInterface g = (GeckoRemoteInterface) LocateRegistry.getRegistry("localhost", portaGecko).lookup("GeckoRemoteInterface");
        g.connect();
        MaiSimMotor m = new MaiSimMotor(g);
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
                        catch (Throwable e) { Throwable c = e.getCause() != null ? e.getCause() : e; r = "ERR " + String.valueOf(c).replace('\n', ' '); }
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
            case "TIME": return Double.toString(g.getSimulationTime());
            case "END": g.endSimulation(); return "";
            case "GET": return Double.toString(g.getOutput(p[1]));
            case "GETM": {                                                           // GETM nome1 nome2 … → valores
                String[] nomes = Arrays.copyOfRange(p, 1, p.length);
                double[] v;
                try {
                    v = g.getOutputs(nomes);                                         // uma chamada (jar com a leitura em lote)
                } catch (Throwable semLote) {                                        // jar antigo: uma por nome
                    v = new double[nomes.length];
                    for (int i = 0; i < nomes.length; i++) v[i] = g.getOutput(nomes[i]);
                }
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
                    if (q.length != 3) throw new IllegalArgumentException("SETM espera nome:parâmetro:valor, veio " + p[i + 1]);
                    nomes[i] = q[0]; pars[i] = q[1]; v[i] = Double.parseDouble(q[2]);
                }
                try {
                    g.setParameterMany(nomes, pars, v);
                } catch (Throwable semLote) {
                    for (int i = 0; i < n; i++) g.setParameter(nomes[i], pars[i], v[i]);
                }
                return "";
            }
            default: throw new IllegalArgumentException("comando desconhecido: " + p[0] + " (comandos: " + Arrays.toString(
                    new String[]{"PING", "OPEN", "SAVEAS", "CREATE", "DELETE", "MOVE", "POS", "ROTATE", "ORIENT", "RENAME", "PARAMS",
                            "ACCPARAMS", "GETP", "SETP", "GETG", "SETG", "INNODE", "OUTNODE", "GETIN", "GETOUT", "LIST", "SHEET", "CLEAR", "INIT", "STEP", "TIME", "END", "GET", "GETM", "SETM", "QUIT"}) + ")");
        }
    }
}
