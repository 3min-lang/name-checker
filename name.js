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
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://naming123.doitwell.tw/', { waitUntil: 'domcontentloaded' });

    /* 填三欄 */
    await page.type('input[name="lastname"]', lastname || fullName[0]);
    if (middlename) await page.type('input[name="middlename"]', middlename);
    await page.type(
      'input[name="firstname"]',
      firstname || (middlename ? fullName.slice(-1) : fullName.slice(1))
    );

    /* 移除廣告層（若有） */
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('span')].find(el => el.textContent.trim() === '關閉');
      btn?.closest('div')?.remove();
    });

    /* 送出表單並等待跳頁 */
    await Promise.all([
      page.$eval('form', f => f.submit()),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 })
    ]);

    /* 等結果區塊出現 */
    await page.waitForSelector('.leftBigBlock', { timeout: 60000 });

    /* 擷取資料 */
    const result = await page.evaluate(() => {
      // 擷取五格簡化版
      const forfiveDivs = document.querySelectorAll('.forfive');
      const simplified = [...forfiveDivs].map(div => {
        const raw = div.innerText.replace(/\s+/g, ' ').trim();
        const match = raw.match(/^(.*?格：\s*\d+).*?([木火土金水])/);
        return match ? `${match[1]} ${match[2]}` : raw;
      }).join('\n');

      // 取得完整姓名
      const nameEls = document.querySelectorAll('.name, .span3 > div:not(.name)');
      const fullNameFromPage = [...nameEls].map(el => el.innerText.trim()[0]).join('');

      return `${fullNameFromPage}\n${simplified}`;
    });

    await browser.close();
    res.json({ result });

  } catch (err) {
    console.error('❌', err);
    res.status(500).json({ error: '查詢失敗，稍後再試' });
  }
});

/* ✅ Zeabur 適用 */
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () =>
  console.log(`✅ API 啟動於 Port ${port}`)
);
