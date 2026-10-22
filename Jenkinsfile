// Jenkins declarative pipeline (syllabus Unit 5: check code with Jenkins before
// pushing). It installs both apps, runs unit tests, applies MongoDB validation
// and indexes, seeds a scratch database, starts the API, runs the 148-check HTTP
// suite, builds the React bundle and archives the deployable artifacts.
//
// Requirements on the Jenkins agent:
//   * NodeJS tool named "node-22"
//   * Python 3 with pip (for the HTTP test suite)
//   * MongoDB reachable through the "campuskart-mongodb-uri" credential
//
// Never point MONGODB_DB at the demo database: the seed stage wipes it.
pipeline {
  agent any
  options {
    timestamps()
    disableConcurrentBuilds()
  }
  tools { nodejs "node-22" }
  environment {
    MONGODB_URI = credentials("campuskart-mongodb-uri")
    MONGODB_DB  = "campuskart_ci"
    PORT        = "8080"
  }
  stages {
    stage("Checkout") {
      steps { checkout scm }
    }
    stage("Backend dependencies") {
      steps { dir("backend") { sh "npm ci" } }
    }
    stage("Backend syntax check") {
      steps {
        dir("backend") {
          sh "node --check server.js"
          sh "node --check rest.js"
          sh "node -e \"require('./src/routes'); require('./src/models'); require('./src/validators'); require('./src/events');\""
        }
      }
    }
    stage("Backend unit tests") {
      steps { dir("backend") { sh "npm test" } }
    }
    stage("Frontend dependencies") {
      steps { dir("frontend") { sh "npm ci" } }
    }
    stage("Frontend unit tests") {
      steps { dir("frontend") { sh "npm test" } }
    }
    stage("Database schema and indexes") {
      steps { dir("backend") { sh "npm run db:init" } }
    }
    stage("Seed CI database") {
      steps { dir("backend") { sh "npm run seed" } }
    }
    stage("Verify seed relationships") {
      steps { dir("backend") { sh "npm run db:verify" } }
    }
    stage("Build frontend") {
      steps { dir("frontend") { sh "npm run build" } }
    }
    stage("Start API") {
      steps {
        dir("backend") {
          sh "nohup node server.js > ../api.log 2>&1 & echo $! > ../api.pid"
          sh "for i in $(seq 1 30); do curl -fsS http://localhost:8080/health >/dev/null && break; sleep 1; done"
          sh "curl -fsS http://localhost:8080/health >/dev/null"
          sh "curl -fsS http://localhost:8080/api/v1/items >/dev/null"
        }
      }
    }
    stage("API end-to-end") {
      steps {
        sh "python3 -m pip install --quiet requests"
        sh "python3 backend/tests/e2e.py http://localhost:8080"
      }
    }
    stage("Archive build") {
      steps {
        archiveArtifacts artifacts: "frontend/dist/**", fingerprint: true
        archiveArtifacts artifacts: "postman/CampusKart.postman_collection.json, postman/CampusKart-REST.postman_collection.json", fingerprint: true
        archiveArtifacts artifacts: "database/seed.json, database/schemas/validators.js", fingerprint: true
      }
    }
  }
  post {
    always {
      sh "test -f api.pid && kill $(cat api.pid) || true"
      archiveArtifacts artifacts: "api.log", allowEmptyArchive: true
    }
  }
}
