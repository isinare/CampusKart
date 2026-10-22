package in.campuskart.demo;

import java.io.IOException;
import java.io.PrintWriter;
import java.time.Instant;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Isolated Tomcat example. It demonstrates the servlet lifecycle and a JSON
 * response and has no dependency on the Node/MongoDB application.
 *
 * Deploy the built WAR as $CATALINA_HOME/webapps/campuskart-demo.war and open:
 *   http://localhost:8080/campuskart-demo/health
 */
public class HelloServlet extends HttpServlet {
  private static final long serialVersionUID = 1L;

  @Override
  public void init() throws ServletException {
    log("CampusKart Tomcat demo started");
  }

  @Override
  protected void doGet(HttpServletRequest request, HttpServletResponse response)
      throws ServletException, IOException {
    response.setContentType("application/json;charset=UTF-8");
    response.setHeader("Cache-Control", "no-store");
    try (PrintWriter out = response.getWriter()) {
      out.print("{\"status\":\"ok\",\"servlet\":\"HelloServlet\",");
      out.print("\"path\":\"" + escape(request.getRequestURI()) + "\",");
      out.print("\"time\":\"" + Instant.now() + "\"}");
    }
  }

  private String escape(String value) {
    return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
  }
}
