const readline = require("readline");
const dotenv = require('dotenv');
const axios = require('axios');
const { RecaptchaV2Task } = require("node-capmonster");
const fs = require('fs')
const FormData = require('form-data');

const browserObject = require("./utils/browser");
const delay = require("./helper/delay");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const urlPattern = /^(ftp|http|https):\/\/[^ "]+$/;
const isValidURL = (url) => {
  return urlPattern.test(url);
}

dotenv.config();
let browser, page;

(async () => {
  browser = await browserObject.startBrowser(false);
  page = await browser.pages();
  page = page[0];
  await page.setDefaultNavigationTimeout(0);
})();

const startAction = async () => {
  rl.question(
    "Enter the url (like: https://*.blogabet.com/pick/*.....): ",
    async (url) => {
      if (!url || !isValidURL(url)) {
        console.log("input url not specified");
        await startAction();
        return 0
      }

      await page.goto(url);
      await delay(200)

      let sitekey = process.env.siteKey
      let apiToken = process.env.telegramToken;
      let chatId = process.env.telegramChatId
      try {
        await page.waitForSelector('div.g-recaptcha', { timeout: 500 })
        const client = new RecaptchaV2Task(process.env.capmonsterKey)
        const task = client.task({
          websiteKey: sitekey,
          websiteURL: url,
        })

        console.log("solving captcha...")
        const taskId = await client.createWithTask(task)
        const result = await client.joinTaskResult(taskId)
        console.log("get response:", result.gRecaptchaResponse)

        await page.evaluate(
          async (token) => {
            document.getElementById("g-recaptcha-response").innerHTML = token;
          },
          result.gRecaptchaResponse
        );
        await delay(200)

        await page.evaluate((token) => {
          window.findRecaptchaClients = function () {
            if (typeof (___grecaptcha_cfg) !== 'undefined') {
              return Object.entries(___grecaptcha_cfg.clients).map(([cid, client]) => {
                const data = { id: cid, version: cid >= 10000 ? 'V3' : 'V2' };
                const objects = Object.entries(client).filter(([_, value]) => value && typeof value === 'object');

                objects.forEach(([toplevelKey, toplevel]) => {
                  const found = Object.entries(toplevel).find(([_, value]) => (
                    value && typeof value === 'object' && 'sitekey' in value && 'size' in value
                  ));

                  if (typeof toplevel === 'object' && toplevel instanceof HTMLElement && toplevel['tagName'] === 'DIV') {
                    data.pageurl = toplevel.baseURI;
                  }

                  if (found) {
                    const [sublevelKey, sublevel] = found;

                    data.sitekey = sublevel.sitekey;
                    const callbackKey = data.version === 'V2' ? 'callback' : 'promise-callback';
                    const callback = sublevel[callbackKey];
                    data.topKey = toplevelKey;
                    data.subKey = sublevelKey;
                    if (!callback) {
                      data.callback = null;
                      data.function = null;
                    } else {
                      data.function = callback;
                      const keys = [cid, toplevelKey, sublevelKey, callbackKey].map((key) => `['${key}']`).join('');
                      data.callback = `___grecaptcha_cfg.clients${keys}`;
                    }
                  }
                });
                return data;
              });
            }
            return [];
          }

          window.callbackRes = findRecaptchaClients();
          let rTopKey = window.callbackRes[0].topKey
          let rSubKey = window.callbackRes[0].subKey
          window.___grecaptcha_cfg.clients[0][rTopKey][rSubKey]['callback'](token)

        }, result.gRecaptchaResponse)
      } catch (err) { console.log("there is no captcha") }

      await page.waitForSelector('div.feed-pick-title')
      let title = await page.$eval('div.feed-pick-title > div.no-padding > h3', h3 => h3.innerText)
      let content1 = await page.$eval('div.pick-line', div => div.innerText)
      let content2 = await page.$eval('div.sport-line', div => div.innerText)
      let content3 = await page.$eval('div.labels', div => div.innerText)

      const contentBoundingBox = await page.$eval('#feed-list', element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      });

      const screenshot = await page.screenshot({
        clip: {
          x: contentBoundingBox.x,
          y: contentBoundingBox.y,
          width: contentBoundingBox.width,
          height: contentBoundingBox.height
        }
      });

      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', screenshot, { filename: 'screenshot.png' });
      formData.append('caption', `*${title}*\n${content1}\n\n${content2}\n\n${content3}`);

      try {
        await axios.post(`https://api.telegram.org/bot${apiToken}/sendPhoto`, formData, {
          headers: formData.getHeaders(),
        }).then(() => {
          console.log('Image and text message sent via Telegram');
        });
      } catch (err) {
        console.log(err)
      }

      await startAction();
    })
};

startAction();
