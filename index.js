const port = process.env.PORT || 3000

const url = require('url')
const MongoClient = require('mongodb').MongoClient
const dns = require('dns');
const nanoid = require('nanoid');
var express = require("express");
var app = express();

app.use(express.json());

app.listen(port, err => {
    if (err) throw err
    console.log(`> Ready On Server http://localhost:${port}`)
});

let cachedDb = null

async function connectToDatabase(uri) {
  if (cachedDb) return cachedDb.collection('shortened')

  const client = await MongoClient.connect(uri, { useNewUrlParser: true })
  const db = await client.db(url.parse(uri).pathname.substr(1))

  cachedDb = db
  return db.collection('shortened')
}

app.post('/shorten', async (req, res, next) => {
    let { url } = req.body;
    if(!url) return res.status(400).send('Missing url parameter')

    try {
      url = new URL(url);
    } catch (err) {
      return res.status(400).send('Invalid URL');
    }

    dns.lookup(url.hostname, (err) => {
      if (err) return res.status(404).send('Address not found');
    });

    const shortened = await connectToDatabase(process.env.MONGODB_URI)

    shortened.findOneAndUpdate({ original_url: url.href },
      {
        $setOnInsert: {
          original_url: url.href,
          short_id: nanoid(7),
        },
      },
      {
        returnOriginal: false,
        upsert: true,
      }
    ).then(result => {
      const { original_url, short_id } = result.value;
      res.json({ original_url, short_id });
    }).catch(console.error);
});

app.get('/:short_id', async (req, res) => {
  const { short_id } = req.params;

  const shortened = await connectToDatabase(process.env.MONGODB_URI)

  shortened
  .findOne({ short_id })
  .then(result => {
    if (!result) return res.status(404);
    res.redirect(result.original_url)
  })
  .catch(console.error)
});