// ============================================================
//  Messenger Webhook Server  -  bắt PSID, gửi nút có link landing kèm PSID
//  KHÔNG sửa file này. Mọi giá trị bí mật điền ở Render (Environment).
// ============================================================
const express = require('express');
const crypto = require('crypto');
const app = express();

// đọc raw body để verify chữ ký Meta
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// ====== Biến môi trường (điền ở Render, KHÔNG ghi token vào đây) ======
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN; // token Page
const VERIFY_TOKEN      = process.env.VERIFY_TOKEN;      // chuỗi bạn tự đặt
const APP_SECRET        = process.env.APP_SECRET;        // App Secret
const LANDING_URL       = process.env.LANDING_URL;       // vd https://abc.netlify.app
const GRAPH = 'https://graph.facebook.com/v19.0';

// ---------- 1. Xác minh webhook (Meta gọi 1 lần khi setup) ----------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---------- 2. Nhận sự kiện từ Meta ----------
app.post('/webhook', (req, res) => {
  console.log('>>> POST /webhook nhận được lúc', new Date().toISOString());
  console.log('>>> BODY:', JSON.stringify(req.body));

  // verify chữ ký (chỉ cảnh báo, KHÔNG chặn - để debug)
  if (APP_SECRET) {
    const sig = req.headers['x-hub-signature-256'];
    if (sig) {
      const expected = 'sha256=' + crypto.createHmac('sha256', APP_SECRET)
        .update(req.rawBody).digest('hex');
      if (sig !== expected) console.log('>>> CANH BAO: chu ky khong khop (van xu ly)');
    } else {
      console.log('>>> Khong co chu ky x-hub-signature-256');
    }
  }

  const body = req.body;
  if (body.object !== 'page') { console.log('>>> object khong phai page:', body.object); return res.sendStatus(404); }

  body.entry.forEach(entry => {
    const event = entry.messaging && entry.messaging[0];
    if (!event) { console.log('>>> entry khong co messaging'); return; }
    const psid = event.sender && event.sender.id;
    if (!psid) { console.log('>>> khong co psid'); return; }
    console.log('>>> PSID:', psid, '| co message:', !!event.message, '| postback:', !!event.postback, '| referral:', !!event.referral);

    if (event.message || event.postback || event.referral) {
      sendSoButton(psid);
    }
  });

  res.status(200).send('EVENT_RECEIVED');
});

// ---------- 3. Gửi tin có nút "Xem sổ và giá bán" kèm PSID ----------
function sendSoButton(psid) {
  const link = LANDING_URL + '/?psid=' + encodeURIComponent(psid);
  const payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: 'Đất Thổ Cư sổ hồng Sài Gòn chỉ 239tr — sở hữu ngay 👇',
          buttons: [
            { type: 'web_url', url: link, title: 'Tôi muốn gửi bán dùm' }
          ]
        }
      }
    }
  };
  fetch(GRAPH + '/me/messages?access_token=' + PAGE_ACCESS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(d => console.log('SENT', JSON.stringify(d)))
  .catch(e => console.error('SEND_ERR', e));
}

app.get('/', (req, res) => res.send('Webhook server is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on ' + PORT));
