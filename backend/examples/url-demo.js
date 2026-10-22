#!/usr/bin/env node
/* Small `url` module demonstration used in the Node.js lab. */
const { URL, URLSearchParams, fileURLToPath } = require("url");
const path = require("path");

const url = new URL("https://campus.example.edu.in:8443/items?category=books&max=400#recent");
console.log("origin      :", url.origin);
console.log("host        :", url.host);
console.log("pathname    :", url.pathname);
console.log("category    :", url.searchParams.get("category"));
console.log("max         :", url.searchParams.get("max"));
console.log("hash        :", url.hash);

const query = new URLSearchParams({ status: "AVAILABLE", sort: "price_asc" });
console.log("query string:", query.toString());

const file = fileURLToPath(new URL("./native-http-server.js", `file://${__filename.replace(/\\/g, "/")}`));
console.log("file path   :", path.normalize(file));
