package pew;

import ch.technokrat.gecko.geckocircuits.allg.AbstractComponentTyp;
import ch.technokrat.gecko.geckocircuits.allg.UserParameter;
import ch.technokrat.gecko.geckocircuits.circuit.AbstractBlockInterface;
import ch.technokrat.gecko.geckocircuits.circuit.AbstractTypeInfo;
import ch.technokrat.gecko.geckocircuits.circuit.SpecialTyp;
import ch.technokrat.gecko.geckocircuits.circuit.circuitcomponents.CircuitTyp;
import ch.technokrat.gecko.geckocircuits.control.ControlTyp;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

/**
 * Os parâmetros de cada tipo de componente do Gecko, tirados do próprio Gecko (como a PewGeometria): constrói um bloco de
 * cada tipo (TypeInfo.fabric(), sem a janela) e, para cada UserParameter registrado, grava o nome curto (o da interface
 * remota: getAccessibleParameters/setParameter), os nomes alternativos, o identificador com que ele vai para o arquivo
 * (getSaveIdentifier: a linha "<identificador> valor" e, ligado a uma variável global, "<identificador>$ParameterName $x"),
 * o índice no parameter[]/nameOpt[] antigo e o tipo do valor (só Double e Integer podem vir de uma variável $).
 * uso: java -Djava.awt.headless=true -cp gecko.jar:bin pew.PewParametros > parametros_gecko.json
 */
public final class PewParametros {

    private static String js(Object o) {
        return "\"" + String.valueOf(o).replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    @SuppressWarnings("unchecked")
    private static String lista(UserParameter<?> p, String campo) throws Exception {
        Field f = UserParameter.class.getDeclaredField(campo);
        f.setAccessible(true);
        List<String> l = (List<String>) f.get(p);
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; l != null && i < l.size(); i++) {
            sb.append(i > 0 ? "," : "").append(js(l.get(i)));
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
        Field indice = UserParameter.class.getDeclaredField("_index");
        indice.setAccessible(true);
        System.out.println("[");
        boolean primeiro = true;
        for (AbstractComponentTyp t : tipos) {
            String linha;
            try {
                AbstractTypeInfo info = t.getTypeInfo();
                AbstractBlockInterface b = info.fabric();
                StringBuilder ps = new StringBuilder("[");
                boolean p1 = true;
                for (UserParameter<?> p : b.getRegisteredParameters()) {
                    Object v = p.getValue();
                    ps.append(p1 ? "" : ",").append(String.format("{\"curto\":%s,\"curtos\":%s,\"alternativos\":%s,\"id\":%s,\"indice\":%d,\"valor\":%s}",
                            js(p.getShortName()), lista(p, "_shortNames"), lista(p, "_alternativeShortName"), js(p.getSaveIdentifier()),
                            indice.getInt(p), js(v == null ? "null" : v.getClass().getSimpleName())));
                    p1 = false;
                }
                linha = String.format("{\"enum\":\"%s\",\"id\":\"%s\",\"classe\":\"%s\",\"parametros\":%s]}",
                        t, info._fixedIDString, b.getClass().getSimpleName(), ps);
            } catch (Throwable e) {                                  // tipo que não se constrói sem a janela: registra o erro
                linha = String.format("{\"enum\":\"%s\",\"erro\":%s}", t, js(e));
            }
            System.out.println((primeiro ? "" : ",") + linha);
            primeiro = false;
        }
        System.out.println("]");
        System.exit(0);
    }
}
