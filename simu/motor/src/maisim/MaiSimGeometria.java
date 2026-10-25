package maisim;

import ch.technokrat.gecko.geckocircuits.circuit.AbstractBlockInterface;
import ch.technokrat.gecko.geckocircuits.allg.AbstractComponentTyp;
import ch.technokrat.gecko.geckocircuits.circuit.AbstractTerminal;
import ch.technokrat.gecko.geckocircuits.circuit.AbstractTypeInfo;
import ch.technokrat.gecko.geckocircuits.circuit.SpecialTyp;
import ch.technokrat.gecko.geckocircuits.circuit.ComponentDirection;
import ch.technokrat.gecko.geckocircuits.circuit.TerminalFixedPosition;
import ch.technokrat.gecko.geckocircuits.circuit.TerminalRelativePosition;
import ch.technokrat.gecko.geckocircuits.circuit.TerminalTwoPortComponent;
import ch.technokrat.gecko.geckocircuits.circuit.TerminalTwoPortRelativeFixedDirection;
import ch.technokrat.gecko.geckocircuits.circuit.circuitcomponents.CircuitTyp;
import ch.technokrat.gecko.geckocircuits.control.ControlTyp;
import ch.technokrat.gecko.geckocircuits.control.RegelBlock;
import ch.technokrat.gecko.geckocircuits.control.VariableTerminalNumber;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

/**
 * Geometria dos terminais de cada tipo de componente do Gecko, tirada do próprio Gecko: constrói um bloco de cada tipo
 * (TypeInfo.fabric(), sem a janela) e lê a posição relativa crua (_posX, _posY) de cada entrada (XIN) e saída (YOUT); o
 * ponto na folha é TerminalRelativePosition.getPointFromDirection(orientação, centro, _posX, _posY) (503: x+posX, y−posY).
 * Saída: JSON (uma linha por tipo) em stdout, para o leitor do .ipes (ipes.py) pôr os terminais onde o Gecko põe; num bloco
 * de controle com mais de uma saída, também os nomes delas (nomes_saida: o que o servidor pede ao Gecko, uma por sinal) —
 * e num que pode ter mais de uma conforme o arquivo (VariableTerminalNumber: o Sliding DFT, uma por frequência; o From
 * EXTERNAL), mesmo que o de fábrica tenha uma só: o Sliding DFT só nomeia "DFT" (a 1ª), o From EXTERNAL "0", "1", "2", "etc.".
 * Os terminais sem posição relativa (os da térmica e os de dois pinos): {"dist": d} no TerminalTwoPortComponent (centro + d
 * na direção da orientação do elemento), {"dist": d, "dir": código} no TerminalTwoPortRelativeFixedDirection (centro + d
 * numa direção fixa, qualquer que seja a orientação: a saída do Pv, a entrada do TREF) e {"fixo": [x, y]} no
 * TerminalFixedPosition (o THERMAL_ZERO, (−4711, −4711), invisível: o lado de referência do Pv e do TREF).
 * uso: java -Djava.awt.headless=true -cp gecko.jar:bin maisim.MaiSimGeometria > geometria.json
 */
public final class MaiSimGeometria {

    private static String pontos(List<AbstractTerminal> terms) throws Exception {
        StringBuilder sb = new StringBuilder("[");
        Field fx = TerminalRelativePosition.class.getDeclaredField("_posX");
        Field fy = TerminalRelativePosition.class.getDeclaredField("_posY");
        Field fd2 = TerminalTwoPortComponent.class.getDeclaredField("_termDist");
        Field fdf = TerminalTwoPortRelativeFixedDirection.class.getDeclaredField("_termDist");
        Field fdir = TerminalTwoPortRelativeFixedDirection.class.getDeclaredField("_fixedDirection");
        Field fpos = TerminalFixedPosition.class.getDeclaredField("_fixedPosition");
        for (Field f : new Field[]{fx, fy, fd2, fdf, fdir, fpos}) {
            f.setAccessible(true);
        }
        for (int i = 0; i < terms.size(); i++) {
            AbstractTerminal t = terms.get(i);
            if (i > 0) {
                sb.append(",");
            }
            if (t instanceof TerminalRelativePosition) {               // os valores crus: o leitor aplica a orientação
                sb.append("[").append(fx.getInt(t)).append(",").append(fy.getInt(t)).append("]");
            } else if (t instanceof TerminalTwoPortComponent) {        // dois pinos: na direção da orientação do elemento
                sb.append("{\"dist\":").append(fd2.getInt(t)).append("}");
            } else if (t instanceof TerminalTwoPortRelativeFixedDirection) {   // numa direção fixa (Pv, TREF)
                sb.append("{\"dist\":").append(fdf.getInt(t)).append(",\"dir\":").append(((ComponentDirection) fdir.get(t)).code()).append("}");
            } else if (t instanceof TerminalFixedPosition) {           // ponto fixo da folha (o zero térmico)
                Object q = fpos.get(t);                               // o Point do próprio Gecko (control.Point), campos x e y
                sb.append("{\"fixo\":[").append(q.getClass().getField("x").getInt(q)).append(",").append(q.getClass().getField("y").getInt(q)).append("]}");
            } else {
                sb.append("null");                                   // outro tipo de terminal
            }
        }
        return sb.append("]").toString();
    }

    /** Os nomes das saídas de um bloco de controle com mais de uma, ou que pode ter mais de uma (VariableTerminalNumber: o
     *  número de saídas vem do arquivo), pelo getOutputNames (o que o getOutput(bloco, saída) da interface remota aceita),
     *  como ,"nomes_saida":[…]; nada para os outros (nem para um sem nome de saída). */
    private static String nomesSaida(AbstractBlockInterface b) {
        if (!(b instanceof RegelBlock) || (b.YOUT.size() < 2 && !(b instanceof VariableTerminalNumber))) {
            return "";
        }
        String[] nomes = ((RegelBlock) b).getOutputNames();
        if (nomes == null || nomes.length == 0) {
            return "";
        }
        StringBuilder sb = new StringBuilder(",\"nomes_saida\":[");
        for (int i = 0; i < nomes.length; i++) {
            sb.append(i > 0 ? "," : "").append("\"").append(nomes[i].replace("\\", "\\\\").replace("\"", "\\\"")).append("\"");
        }
        return sb.append("]").toString();
    }

    public static void main(String[] args) throws Exception {
        List<AbstractComponentTyp> tipos = new ArrayList<AbstractComponentTyp>();
        for (ControlTyp t : ControlTyp.values()) {
            tipos.add(t);
        }
        for (SpecialTyp t : SpecialTyp.values()) {
            tipos.add(t);
        }
        for (CircuitTyp t : CircuitTyp.values()) {
            tipos.add(t);
        }
        System.out.println("[");
        boolean primeiro = true;
        for (AbstractComponentTyp t : tipos) {
            String linha;
            try {
                AbstractTypeInfo info = t.getTypeInfo();
                AbstractBlockInterface b = info.fabric();
                linha = String.format("{\"enum\":\"%s\",\"id\":\"%s\",\"classe\":\"%s\",\"entradas\":%s,\"saidas\":%s%s}",
                        t, info._fixedIDString, b.getClass().getSimpleName(), pontos(new ArrayList<AbstractTerminal>(b.XIN)),
                        pontos(new ArrayList<AbstractTerminal>(b.YOUT)), nomesSaida(b));
            } catch (Throwable e) {                                  // tipo que não se constrói sem a janela: registra o erro
                linha = String.format("{\"enum\":\"%s\",\"erro\":\"%s\"}", t, String.valueOf(e).replace("\"", "'").replace("\\", "/"));
            }
            System.out.println((primeiro ? "" : ",") + linha);
            primeiro = false;
        }
        System.out.println("]");
        System.exit(0);
    }
}
