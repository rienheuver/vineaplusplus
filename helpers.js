const puppeteer = require("puppeteer");
const { json } = require("body-parser");

module.exports.getData = async function (username, password, combine = false) {
  console.log("Launching headless browser");
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  console.log("Visiting mijnreisleiding.nl");
  await page.goto("http://mijnreisleiding.nl", { waitUntil: "networkidle2" });
  await page.waitForSelector('input[type="password"]');

  await page.focus('input[type="text"]');
  await page.keyboard.type(username);

  await page.focus('input[type="password"]');
  await page.keyboard.type(password);

  await page.click('button[type="submit"');
  console.log(`Logging in with user ${username}`);

  await page.waitForSelector(".navbar-nav");

  console.log(`Analysing camp roster`);
  await page.goto("http://mijnreisleiding.nl/jouwrooster", {
    waitUntil: "networkidle2",
  });

  let campsMeta = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".order_box > a[href]")).map(
      (a) => {
        const parts = a.href.split("/");
        return [parts[parts.length - 1], a.innerText];
      }
    );
  });

  // campsMeta = [campsMeta[0]];

  const camps = {};
  for (const c of campsMeta) {
    camps[c[1]] = {};
    console.log(
      `Getting regular data on camp with ID ${c[0]} at https://www.mijnreisleiding.nl/participantlist/${c[0]}`
    );
    await page.goto(`https://www.mijnreisleiding.nl/participantlist/${c[0]}`, {
      waitUntil: "networkidle2",
    });
    const data = await page.evaluate(() => {
      const headers = Array.from(
        document.querySelectorAll(".table_naw thead th")
      ).map((el) =>
        el.innerText
          .toLowerCase()
          .replace("&", "")
          .replace(" ", "_")
          .replace(" ", "")
      );
      return Array.from(document.querySelectorAll(".table_naw tbody tr")).map(
        (row) => {
          const cells = Array.from(row.querySelectorAll("td")).map((td) => {
            const parts = td.innerText.split("\n");
            return parts.length > 1 ? parts : parts[0];
          });
          const jsonRow = {};
          for (let i = 0; i < cells.length; i++) {
            jsonRow[headers[i]] = cells[i];
          }
          return jsonRow;
        }
      );
    });

    console.log(
      `Getting additional data on camp with ID ${c[0]} at https://www.mijnreisleiding.nl/participantlistadditional/${c[0]}`
    );

    await page.goto(
      `https://www.mijnreisleiding.nl/participantlistadditional/${c[0]}`,
      {
        waitUntil: "networkidle2",
      }
    );
    const data2 = await page.evaluate(() => {
      const headers = Array.from(
        document.querySelectorAll(".order_section .head div")
      ).map((el) =>
        el.innerText
          .toLowerCase()
          .replace("&", "")
          .replace(" ", "_")
          .replace(" ", "")
      );

      return Array.from(document.querySelectorAll(".order_section .info")).map(
        (row) => {
          const cells = Array.from(row.querySelectorAll(":scope > div")).map(
            (cell) => {
              const parts = cell.innerText.split("\n");
              return parts.length > 1 ? parts : parts[0];
            }
          );
          const jsonRow = {};
          for (let i = 0; i < cells.length; i++) {
            if (headers[i]) {
              jsonRow[headers[i]] = cells[i];
            } else {
              if (jsonRow["comments"]) {
                jsonRow["comments"] += ", " + cells[i];
              } else {
                jsonRow["comments"] = cells[i];
              }
            }
          }
          if (typeof jsonRow["comments"] === "string") {
            jsonRow["comments"] = jsonRow["comments"].replace(
              /(^[,\s]+)|([,\s]+$)/g,
              ""
            );
          }
          return jsonRow;
        }
      );
    });

    const campGroups = [];
    const fullData = [];
    const datesRegex = /(\d+)-(\d+)-(\d+)/g;
    const startEnd = [...c[1].matchAll(datesRegex)];
    const timePartsStart = startEnd[0][0].split("-").map((t) => parseInt(t));
    const startDate = new Date(
      timePartsStart[2],
      (timePartsStart[1] + 11) % 12,
      timePartsStart[0]
    );
    const timePartsEnd = startEnd[1][0].split("-").map((t) => parseInt(t));
    const endDate = new Date(
      timePartsEnd[2],
      (timePartsEnd[1] + 11) % 12,
      timePartsEnd[0]
    );
    for (let i = 0; i < data2.length; i++) {
      const name = data2[i].naam;
      let partTwo;
      for (let i = 0; i < data.length; i++) {
        if (data[i].naam_contactgevegens[0].includes(name)) {
          partTwo = data[i];
          break;
        }
      }
      const person = { ...partTwo, ...data2[i] };
      person.geboorteDatum = person.geboren[0];
      const timeParts = person.geboorteDatum.split("-").map((t) => parseInt(t));
      const birthDate = new Date(
        timeParts[2],
        (timeParts[1] + 11) % 12,
        timeParts[0]
      );
      const birthday = new Date(
        timePartsStart[2],
        (timeParts[1] + 11) % 12,
        timeParts[0]
      );
      if (birthday >= startDate && birthday <= endDate) {
        person.jarig = true;
      }
      person.leeftijd = Math.abs(
        new Date(new Date() - birthDate.getTime()).getUTCFullYear() - 1970
      );
      
      person.telefoon = person.naam_contactgevegens[1];
      person.noodnummer = person.naam_contactgevegens.length > 3 ? person.naam_contactgevegens[2] : 'Onbekend';

      person.naam = person.naam[0].toUpperCase() + person.naam.substring(1);

      person.geslacht =
        person.naam_contactgevegens[
          person.naam_contactgevegens.length - 1
        ].split(" ")[1];

      Object.keys(person).map((key) => {
        if (Array.isArray(person[key])) {
          person[key] = person[key].join(", ");
        }
      });

      if (!campGroups.includes(person.vakantie)) {
        campGroups.push(person.vakantie);
      }

      person.json = JSON.stringify(person);

      fullData.push(person);
    }

    // camps.push(fullData);
    for (const campGroup of campGroups) {
      const camp = {};
      camp.participants = fullData.filter(
        (person) => person.vakantie == campGroup
      );
      setCampMeta(camp);
      camps[c[1]][campGroup] = camp;
    }

    if (combine) {
      const camp = {
        participants: [],
      };
      for (const group of Object.keys(camps[c[1]])) {
        camp.participants = camp.participants.concat(
          ...camps[c[1]][group].participants
        );
      }
      setCampMeta(camp);
      camps[c[1]] = {
        "Alle kampen": camp,
      };
    }
  }

  console.log(`Jobs done, got data on ${campsMeta.length} camps`);
  browser.close();

  return camps;
};

function setCampMeta(camp) {
  camp.participantCount = camp.participants.length;
  camp.womenCount = camp.participants.filter(
    (p) => p.geslacht == "vrouw"
  ).length;
  camp.menCount = camp.participantCount - camp.womenCount;
  camp.averageAge = (
    camp.participants.reduce((total, p) => total + p.leeftijd, 0) /
    camp.participantCount
  ).toFixed(2);
  camp.birthdays = camp.participants.filter((p) => p.jarig).length;
}
