package maisim;

import ch.technokrat.gecko.geckocircuits.circuit.AbstractBlockInterface;
import ch.technokrat.gecko.geckocircuits.allg.AbstractComponentTyp;
import ch.technokrat.gecko.geckocircuits.circuit.AbstractTerminal;
import ch.technokrat.gecko.geckocircuits.circuit.AbstractTypeInfo;
import ch.technokrat.gecko.geckocircuits.circuit.SpecialTyp;
import ch.technokrat.gecko.geckocircuits.circuit.TerminalRelativePosition;
import ch.technokrat.gecko.geckocircuits.circuit.circuitcomponents.CircuitTyp;
import ch.technokrat.gecko.geckocircuits.control.ControlTyp;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

/**
 * Geometria dos terminais de cada tipo de componente do Gecko, tirada do próprio Gecko: constrói um bloco de cada tipo
 * (TypeInfo.fabric(), sem a janela) e lê a posição relativa crua (_posX, _posY) de cada entrada (XIN) e saída (YOUT); o
 * ponto na folha é TerminalRelativePosition.getPointFromDirection(orientação, centro, _posX, _posY) (503: x+posX, y−posY).
 * Saída: JSON (uma linha por tipo) em stdout, para o leitor do .ipes (ipes.py) pôr os terminais onde o Gecko põe.
 * uso: java -Djava.awt.headless=true -cp gecko.jar:bin maisim.MaiSimGeometria > geometria.json
 */
public final class MaiSimGeometria {

    private static String pontos(List<AbstractTerminal> terms) throws Exception {
        StringBuilder sb = new StringBuilder("[");
        Field fx = TerminalRelativePosition.class.getDeclaredField("_posX");
        Field fy = TerminalRelativePosition.class.getDeclaredField("_posY");
        fx.setAccessible(true);
        fy.setAccessible(true);
        for (int i = 0; i < terms.size(); i++) {
            AbstractTerminal t = terms.get(i);
            if (i > 0) {
                sb.append(",");
            }
            if (t instanceof TerminalRelativePosition) {               // os valores crus: o leitor aplica a orientação
                sb.append("[").append(fx.getInt(t)).append(",").append(fy.getInt(t)).append("]");
            } else {
                sb.append("null");                                   // terminal sem posição relativa (dois pinos etc.)
            }
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
                linha = String.format("{\"enum\":\"%s\",\"id\":\"%s\",\"classe\":\"%s\",\"entradas\":%s,\"saidas\":%s}",
                        t, info._fixedIDString, b.getClass().getSimpleName(), pontos(new ArrayList<AbstractTerminal>(b.XIN)),
                        pontos(new ArrayList<AbstractTerminal>(b.YOUT)));
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
