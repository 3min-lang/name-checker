const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.json());

app.get('/name-check', (_, res) =>
  res.send('✅ POST {"lastname":"張","middlename":"大","firstname":"明"}')
);

app.post('/name-check', async (req, res) => {
  console.log('📥', req.body);
  const { lastname = '', middlename = '', firstname = '', name = '' } = req.body;
  const fullName = (name || `${lastname}${middlename}${firstname}`).trim();

  if (!/^[\u4e00-\u9fff]{2,4}$/.test(fullName))
    return res.status(400).json({ error: '請傳 2–4 個中文字' });

  try {
    const browser = await puppeteer.launch({
      headless: 'new', // 雲端新版 headless
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    const page = await browser.newPage();
    await page.goto('https://naming123.doitwell.tw/', {
      waitUntil: 'domcontentloaded'
    });

    /* 填寫表單 */
    await page.type('input[name="lastname"]', lastname || fullName[0]);
    if (middlename) await page.type('input[name="middlename"]', middlename);
    await page.type(
      'input[name="firstname"]',
      firstname || (middlename ? fullName.slice(-1) : fullName.slice(1))
    );

    /* 移除可能的廣告層 */
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('span')].find(
        (el) => el.textContent.trim() === '關閉'
      );
      btn?.closest('div')?.remove();
    });

    /* 送出表單並等待跳頁 */
    await Promise.all([
      page.$eval('form', (f) => f.submit()),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })
    ]);

    /* 等結果區塊出現 */
    await page.waitForSelector('.leftBigBlock', { timeout: 60000 });

    /* 擷取資料 */
    const result = await page.evaluate(() => {
      const clean = (el) => el.innerText.replace(/\s+/g, ' ').trim();

      // ✅ 1. 擷取姓名筆劃 + 拼音（包含 <small>）
      const names = [...document.querySelectorAll('.name div')]
        .map(clean)
        .join(' ');

      // ✅ 2. 擷取五格吉凶
      const forfive = [...document.querySelectorAll('.forfive')]
        .map(clean)
        .join('\n');

      // ✅ 3. 擷取命運解析
      const fates = [...document.querySelectorAll('.fate')]
        .map(clean)
        .join('\n');

      return `${names}\n${forfive}\n${fates}`;
    });

    await browser.close();
    res.json({ result });
  } catch (err) {
    console.error('❌', err);
    res.status(500).json({ error: '查詢失敗，稍後再試' });
  }
});

/* ✅ Zeabur 容器用 process.env.PORT */
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () =>
  console.log(`✅ API 啟動於 Port ${port}`)
);
