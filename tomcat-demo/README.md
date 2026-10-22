# Tomcat isolation demo

This folder is a deliberately separate, minimal Java servlet. It has **no**
dependency on the Node.js API, the React build or MongoDB. It exists so the
original Java/Tomcat deployment can still be demonstrated without mixing Java
artifacts into the migrated application.

## Build

Requires JDK 11+ and Maven 3.8+.

```powershell
cd tomcat-demo
mvn clean package
```

The WAR is written to `target/campuskart-demo.war`.

## Deploy (Tomcat 9)

```powershell
Copy-Item target\campuskart-demo.war "$env:CATALINA_HOME\webapps\"
```

Start Tomcat and open:

- <http://localhost:8080/campuskart-demo/>
- <http://localhost:8080/campuskart-demo/health>

The health endpoint returns:

```json
{"status":"ok","servlet":"HelloServlet","path":"/campuskart-demo/health","time":"..."}
```

## Why it is separate

The CampusKart migration is a React + Express + MongoDB application. Keeping the
servlet in its own WAR means a Jenkins agent or reviewer can prove the Tomcat
part without starting Node or changing the production deployment. The main
application does **not** depend on this folder.

## Verification status

Build and deployment are reported separately in the root `README.md`. If Maven
or Tomcat is not installed on the machine, the demo is marked **NOT TESTED**
rather than claimed as passing.
