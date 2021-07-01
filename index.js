const express = require("express");
const bodyParser = require("body-parser");
const { getData } = require("./helpers");
const exphbs = require("express-handlebars");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();

app.engine("handlebars", exphbs());

app.set("view engine", "handlebars");

app.use(express.static("views/"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.get("/", async (req, res) => {
  res.render("home");
});

app.get("/data", async (req, res) => {
  res.sendFile(path.join(__dirname, "views", "data.html"));
});

app.post("/camps", async (req, res) => {
  if (req.body.trust && req.body.trust === "yes") {
    const data = await getData(
      req.body.username,
      req.body.password,
      req.body.combine
    );
    const camps = JSON.stringify(data);

    if (data.length === 0) {
      res.render("home", {
        error: "Geen kampen gevonden. Misschien verkeerde logingegevens?",
      });
    } else {
      res.render("storage", { camps });
    }
  } else {
    res.render("home", {
      error:
        "Als je Rien niet vertrouwt zal hij ook je gegevens niet gebruiken. Maar dan heeft deze app verder ook weinig nut...",
    });
  }
});

app.get("/contact/:name/:email/:phone?", function (req, res) {
  console.log(req.params);

  var vCardsJS = require("vcards-js");

  //create a new vCard
  var vCard = vCardsJS();

  //set properties
  const nameParts = req.params.name.split(" ");
  vCard.firstName = nameParts[0];
  vCard.middleName =
    nameParts.length > 2
      ? nameParts.slice(1, nameParts.length - 1).concat(" ")
      : "";
  vCard.lastName = nameParts[nameParts.length - 1];
  vCard.homePhone = req.params.phone ?? "-";
  vCard.email = req.params.email;
  vCard.organization = "Vinea";

  //set content-type and disposition including desired filename
  const filename = req.params.name.replace(/ /g, "_");
  res.set("Content-Type", `text/vcard; name="${filename}.vcf"`);
  res.set("Content-Disposition", `inline; filename="${filename}.vcf"`);

  //send the response
  res.send(vCard.getFormattedString());
});

app.listen(6363, () => {
  console.log("App listing on port 6363");
});
