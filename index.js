const express = require("express");
const bodyParser = require("body-parser");
const { getData } = require("./helpers");
const exphbs = require("express-handlebars");

const app = express();

app.engine("handlebars", exphbs());
app.set("view engine", "handlebars");

app.use(express.static("views/"));
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", async (req, res) => {
  res.render("home");
});

app.post("/camps", async (req, res) => {
  if (req.body.trust && req.body.trust === "yes") {
    const data = await getData(req.body.username, req.body.password);
    if (Object.keys(data).length === 0) {
      res.render("home", {error: 'Geen kampen gevonden. Misschien verkeerde logingegevens?'});
    } else {
      // res.json({data});
      res.render("data", { data });
    }
  } else {
    res.render("home", {error: "Als je Rien niet vertrouwt zal hij ook je gegevens niet gebruiken. Maar dan heeft deze app verder ook weinig nut..."});
  }
});

app.listen(6363, () => {
  console.log("App listing on port 6363");
});
