import Slimbot from 'slimbot';
import { TOKEN } from './config.js';
import randomUseragent from 'random-useragent';
import fs from 'file-system';
import Puppeteer from 'puppeteer';

const bot = new Slimbot(TOKEN);
const min = 60000;
const allMarketData = 'https://mfd.ru/marketdata/?id=5&mode=3&group=16';
const blueChipsMarketData = 'https://mfd.ru/marketdata/?id=5&mode=1';
const minVolume = 3000000;
const hourFactor = new Date().getHours() / 10;
const condition = 1;

bot.startPolling();

function roundNumber(value) {
  return +value.toFixed(3);
}

function getDate() {
  return new Date().getHours() + ':' + new Date().getMinutes() + ':' + new Date().getSeconds();
}

async function getData() {
  let browser = await Puppeteer.launch();
  let page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (['image', 'stylesheet', 'font'].indexOf(request.resourceType()) !== -1) {
      request.abort();
    } else {
      request.continue();
    }
  });

  //Делаем запрос к нужной нам странице (дожидаемся только построения DOM)
  await page.goto(allMarketData, { waitUntil: 'domcontentloaded' });
  await page.click('.m-button-link-dotted');
  await page.type('#mfd-logon-dialog input[name=username]', 'skireal@mail.ru');
  await page.type('#mfd-logon-dialog input[name=password]', 'puka666');
  await page.click('#mfd-logon-dialog button[type=submit]');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  return page;
}

setInterval(() => {
  (async () => {
    try {
      let page = await getData();

      //Парсим DOM

      let result = await page.evaluate(
        (minVolume, hourFactor) => {
          let firstValues = [];
          let indexes = [];

          //Парсим первое значение процентов и объемы сделок. Добавляем в массив подходящие акции. Добавляем номера этих элементов в отдельный массив indexes
          let $dayVolumes = document.querySelectorAll('.mfd-table tr td:nth-child(12)');
          let $firstValues = document.querySelectorAll('.mfd-table tr td:nth-child(5)');

          $firstValues.forEach((firstValue, index) => {
            if (+$dayVolumes[index].textContent.replace(/\s+/g, '') > minVolume * hourFactor) {
              indexes.push(index);
              firstValues.push(
                +firstValue.textContent
                  .replace(/[^0-9.,−]/g, '')
                  .replace(',', '.')
                  .replace('−', '-')
              );
            }
          });

          return { firstValues, indexes };
        },
        minVolume,
        hourFactor
      );

      console.log(result['firstValues'], getDate(), 'первый');

      process.on('warning', (e) => console.warn(e.stack));

      //Ждем X min и перезагружаем страницу
      await new Promise((resolve, reject) => setTimeout(resolve, 10 * min));
      await page.reload();

      let indexes = [];
      indexes = result['indexes'];

      //Опять заново парсим
      let result2 = await page.evaluate(
        (indexes) => {
          //Теперь добавляем проценты только нужных нам акций (номер элемента берем из массива indexes)
          let secondValues = [];
          let $secondValues = document.querySelectorAll('.mfd-table tr td:nth-child(5)');
          $secondValues.forEach((secondValue, index) => {
            if (indexes.includes(index)) {
              secondValues.push(
                +secondValue.textContent
                  .replace(/[^0-9.,−]/g, '')
                  .replace(',', '.')
                  .replace('−', '-')
              );
            }
          });

          //Парсим названия акций
          let tickerNames = [];
          let $tickerNames = document.querySelectorAll('.mfd-table tr td:nth-child(1)');
          $tickerNames.forEach((tickerName, index) => {
            if (indexes.includes(index)) {
              tickerNames.push(tickerName.textContent);
            }
          });

          return { secondValues, indexes, tickerNames };
        },

        indexes
      );

      console.log(result2['secondValues'], getDate(), 'второй');

      //Создаем сообщение из названий акций, которые удовлетворяют условию
      let message = '';
      for (let i = 0; i < result2['secondValues'].length; i++) {
        if (result2['secondValues'][i] - result['firstValues'][i] > condition) {
          message += `${i}.${result2['tickerNames'][i]} = ${roundNumber(result2['secondValues'][i] - result['firstValues'][i])}% \n`;
          console.log(result2['secondValues'][i], result['firstValues'][i]);
        }
      }

      console.log(message, getDate());

      bot.sendMessage(25347317, message);
    } catch (error) {
      console.log(error.response);
      //=> 'Internal server error ...'
    }
  })();
}, 1 * min);
