import Slimbot from 'slimbot';
import { TOKEN } from './config.js';
import got from 'got';
import randomUseragent from 'random-useragent';
import { JSDOM } from 'jsdom';
import jsdom from 'jsdom';
import fs from 'file-system';

const bot = new Slimbot(TOKEN);
const min = 60000;
const allMarketData = 'https://mfd.ru/marketdata/?id=5&mode=3&group=16';
const blueChipsMarketData = 'https://mfd.ru/marketdata/?id=5&mode=1';
const minVolume = 2000000;
const hourFactor = new Date().getHours() / 10;
const condition = 1;

bot.startPolling();

function roundNumber(value) {
  return +value.toFixed(3);
}

function getDate() {
  return new Date().getHours() + ':' + new Date().getMinutes() + ':' + new Date().getSeconds();
}

setInterval(() => {
  (async () => {
    try {
      //Делаем запрос к нужной нам странице
      let response = await got(allMarketData);

      //Парсим DOM
      let resourceLoader = new jsdom.ResourceLoader({
        userAgent: randomUseragent.getRandom(),
      });
      let dom = new JSDOM(response.body, { resources: resourceLoader });

      //Парсим первое значение процентов и объемы сделок. Добавляем в массив подходящие акции. Добавляем номера этих элементов в отдельный массив indexes
      let firstValues = [];
      let indexes = [];
      let $dayVolumes = dom.window.document.querySelectorAll('.mfd-table tr td:nth-child(12)');
      let $firstValues = dom.window.document.querySelectorAll('.mfd-table tr td:nth-child(5)');
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

      //Парсим названия акций
      let tickerNames = [];
      let $tickerNames = dom.window.document.querySelectorAll('.mfd-table tr td:nth-child(1)');
      $tickerNames.forEach((tickerName, index) => {
        if (indexes.includes(index)) {
          tickerNames.push(tickerName.textContent);
        }
      });

      let firstValuesTest = [];
      $firstValues.forEach((firstValue, index) => {
        if (+$dayVolumes[index].textContent.replace(/\s+/g, '') > minVolume * hourFactor) {
          firstValuesTest.push(
            `${index})${+firstValue.textContent
              .replace(/[^0-9.,−]/g, '')
              .replace(',', '.')
              .replace('−', '-')}`
          );
        }
      });

     // console.log(firstValues, 'первый', getDate());

     // fs.appendFileSync('results.html', `${firstValuesTest.join('<br>')} <br> 'первый' ${getDate()} <br><br>`);

      //Ждем X min
      await new Promise((resolve, reject) => setTimeout(resolve, 10 * min));

      //Опять заново парсим
      response = await got(allMarketData);
      dom = new JSDOM(response.body, { resources: resourceLoader });

      //Теперь добавляем проценты только нужных нам акций (номер элемента берем из массива indexes)
      let secondValues = [];
      let $secondValues = dom.window.document.querySelectorAll('.mfd-table tr td:nth-child(5)');
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

      let secondValuesTest = [];
      $secondValues.forEach((secondValue, index) => {
        if (indexes.includes(index)) {
          secondValuesTest.push(
            `${index})${+secondValue.textContent
              .replace(/[^0-9.,−]/g, '')
              .replace(',', '.')
              .replace('−', '-')}`
          );
        }
      });

    //  console.log(secondValues, 'второй', getDate());

     // fs.appendFileSync('results.html', `${secondValuesTest.join('<br>')} <br>'второй' ${getDate()} <br><br>`);

      //Создаем сообщение из названий акций, которые удовлетворяют условию

      let message = '';

      for (let i = 0; i < secondValues.length; i++) {
        if (secondValues[i] - firstValues[i] > condition) {
          console.log(secondValues[i], firstValues[i]);
          message += `${i}.${tickerNames[i]} = ${roundNumber(secondValues[i] - firstValues[i])}% \n`;
          console.log(roundNumber(secondValues[i] - firstValues[i]));
        }
      }

      //fs.appendFileSync('results.html', `${message} ${getDate()} <br><br>`);

      console.log(message, getDate());

      bot.sendMessage(25347317, message);
    } catch (error) {
      //console.log(error.response.body);
      //=> 'Internal server error ...'
    }
  })();
}, 1 * min);

// bot.on('message', (message) => {
//   bot.sendMessage(message.chat.id, 'Message received');
//   console.log(message.chat.id);
// });
