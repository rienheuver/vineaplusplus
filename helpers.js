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
        const meta = {};
        const linkParts = a.href.split("/");
        meta.name = a.innerText;
        meta.id = linkParts[linkParts.length - 1];

        meta.guides = Array.from(
          a.nextElementSibling.nextElementSibling.querySelectorAll(
            ".info_order"
          )
        ).map((g) => {
          const raw = g.querySelector('[data-th="naam"]').innerText;
          const guide = {};
          if (raw.includes("T:")) {
            guide.name = raw.split("T:")[0].trim();
            guide.email = raw.split("T:")[1].split("M:")[0].trim();
            guide.phone = raw.split("T:")[1].split("M:")[1].trim();
          } else {
            guide.name = raw.trim();
            guide.email = "";
            guide.phone = "";
          }
          guide.camp = g.querySelector('[data-th="reis"]').innerText.trim();
          return guide;
        });

        return meta;
      }
    );
  });

  const camps = [];
  for (const campMeta of campsMeta) {
    const camp = {
      name: campMeta.name,
      guides: campMeta.guides,
      groups: {},
      files: []
    };

    console.log(
      `Getting file links from camp with ID ${campMeta.id} at https://www.mijnreisleiding.nl/tripoverview/${campMeta.id}`
    );
    await page.goto(
      `https://www.mijnreisleiding.nl/tripoverview/${campMeta.id}`,
      {
        waitUntil: "networkidle2",
      }
    );
    camp.files = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".downloads a[href")).map(
        (link) => {
          const url = link.href;
          const name = link.innerText;
          return { url, name };
        }
      );
    });

    console.log(
      `Getting regular data on camp with ID ${campMeta.id} at https://www.mijnreisleiding.nl/participantlist/${campMeta.id}`
    );
    await page.goto(
      `https://www.mijnreisleiding.nl/participantlist/${campMeta.id}`,
      {
        waitUntil: "networkidle2",
      }
    );
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
      `Getting additional data on camp with ID ${campMeta.id} at https://www.mijnreisleiding.nl/participantlistadditional/${campMeta.id}`
    );

    await page.goto(
      `https://www.mijnreisleiding.nl/participantlistadditional/${campMeta.id}`,
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

    const campGroupNames = [];
    const fullData = [];
    const datesRegex = /(\d+)-(\d+)-(\d+)/g;
    const startEnd = [...camp.name.matchAll(datesRegex)];
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
      person.noodnummer =
        person.naam_contactgevegens.length > 3
          ? person.naam_contactgevegens[2].split("NOOD")[1].trim()
          : false;

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

      if (!campGroupNames.includes(person.vakantie)) {
        campGroupNames.push(person.vakantie);
      }

      person.json = JSON.stringify(person);

      fullData.push(person);
    }

    // camps.push(fullData);
    for (const cg of campGroupNames) {
      const campGroup = {};
      campGroup.participants = fullData.filter(
        (person) => person.vakantie == cg
      );
      setCampMeta(campGroup);
      camp.groups[cg] = campGroup;
    }

    if (combine) {
      const campGroup = {
        participants: [],
      };
      for (const group of Object.keys(camp.groups)) {
        campGroup.participants = campGroup.participants.concat(
          ...camp.groups[group].participants
        );
      }
      setCampMeta(campGroup);
      camp.groups = {
        "Alle kampen": campGroup,
      };
    }
    camps.push(camp);
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
