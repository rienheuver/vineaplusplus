const puppeteer = require('puppeteer');
const { json } = require('body-parser');

module.exports.getData = async function (username, password) {
  console.log('Launching headless browser');
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  console.log('Visiting mijnreisleiding.nl');
  await page.goto('http://mijnreisleiding.nl', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="password"]');

  await page.focus('input[type="text"]');
  await page.keyboard.type(username);

  await page.focus('input[type="password"]');
  await page.keyboard.type(password);

  await page.click('button[type="submit"');
  console.log(`Logging in with user ${username}`);

  await page.waitForSelector('.navbar-nav');

  console.log(`Analysing camp roster`);
  await page.goto('http://mijnreisleiding.nl/jouwrooster', {
    waitUntil: 'networkidle2',
  });

  const campsMeta = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.order_box > a[href]')).map(
      (a) => {
        const parts = a.href.split('/');
        return [parts[parts.length - 1], a.innerText];
      }
    );
  });

  const camps = {};
  for (const c of campsMeta) {
    console.log(
      `Getting regular data on camp with ID ${c[0]} at https://www.mijnreisleiding.nl/participantlist/${c[0]}`
    );
    await page.goto(`https://www.mijnreisleiding.nl/participantlist/${c[0]}`, {
      waitUntil: 'networkidle2',
    });
    const data = await page.evaluate(() => {
      const headers = Array.from(
        document.querySelectorAll('.table_naw thead th')
      ).map((el) =>
        el.innerText
          .toLowerCase()
          .replace('&', '')
          .replace(' ', '_')
          .replace(' ', '')
      );
      return Array.from(document.querySelectorAll('.table_naw tbody tr')).map(
        (row) => {
          const cells = Array.from(row.querySelectorAll('td')).map((td) => {
            const parts = td.innerText.split('\n');
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
        waitUntil: 'networkidle2',
      }
    );
    const data2 = await page.evaluate(() => {
      const headers = Array.from(
        document.querySelectorAll('.order_section .head div')
      ).map((el) =>
        el.innerText
          .toLowerCase()
          .replace('&', '')
          .replace(' ', '_')
          .replace(' ', '')
      );

      return Array.from(document.querySelectorAll('.order_section .info')).map(
        (row) => {
          const cells = Array.from(row.querySelectorAll(':scope > div')).map(
            (cell) => {
              const parts = cell.innerText.split('\n');
              return parts.length > 1 ? parts : parts[0];
            }
          );
          const jsonRow = {};
          for (let i = 0; i < cells.length; i++) {
            if (headers[i]) {
              jsonRow[headers[i]] = cells[i];
            } else {
              if (jsonRow['comments']) {
                jsonRow['comments'] += ', ' + cells[i];
              } else {
                jsonRow['comments'] = cells[i];
              }
            }
          }
          if (typeof jsonRow['comments'] === 'string') {
            jsonRow['comments'] = jsonRow['comments'].replace(
              /(^[,\s]+)|([,\s]+$)/g,
              ''
            );
          }
          return jsonRow;
        }
      );
    });

    const fullData = [];
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
      const timeParts = person.geboorteDatum.split('-').map((t) => parseInt(t));
      const birthday = new Date(
        timeParts[2],
        (timeParts[1] + 11) % 12,
        timeParts[0]
      );
      person.leeftijd = Math.abs(
        new Date(new Date() - birthday.getTime()).getUTCFullYear() - 1970
      );
      person.geslacht = person.naam_contactgevegens[
        person.naam_contactgevegens.length - 1
      ].split(' ')[1];

      Object.keys(person).map((key) => {
        if (Array.isArray(person[key])) {
          person[key] = person[key].join(', ');
        }
      });

      fullData.push(person);
    }

    // camps.push(fullData);
    camps[c[1]] = fullData;
  }

  console.log(`Jobs done, got data on ${campsMeta.length} camps`);
  browser.close();

  return camps;
};
