const express = require('express');
const request = require('request');
const dotenv = require('dotenv');
const querystring = require('querystring');
const fs = require('fs');
const cors = require('cors')

dotenv.config();

const app = express();
app.use(cors());

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

let access_token = '';
let refresh_token = '';

const saveTokens = (accessToken, refreshToken) => {
  access_token = accessToken;
  refresh_token = refreshToken;
  fs.writeFileSync('tokens.json', JSON.stringify({ access_token, refresh_token }));
};

const loadTokens = () => {
  if (fs.existsSync('tokens.json')) {
    const tokens = JSON.parse(fs.readFileSync('tokens.json'));
    access_token = tokens.access_token;
    refresh_token = tokens.refresh_token;
  }
};

const refreshAccessToken = () => {
  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
    },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      saveTokens(body.access_token, refresh_token);
    }
  });
};

app.get('/login', (req, res) => {
  const scope = 'user-read-playback-state user-read-currently-playing';
  const auth_url = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri
    });
  res.redirect(auth_url);
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;
  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
    },
    json: true
  };

  request.post(authOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      saveTokens(body.access_token, body.refresh_token);
      res.send('Login successful! You can now close this tab.');
    } else {
      res.send('Login failed.');
    }
  });
});

app.get('/current', (req, res) => {
  if (!access_token) {
    loadTokens();
  }

  const options = {
    url: 'https://api.spotify.com/v1/me/player/currently-playing',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };

  request.get(options, (error, response, body) => {
    if (response.statusCode === 401) {
      refreshAccessToken();
      res.redirect('/current'); // Retry after refreshing token
    } else if (body && body.item) {
      const track = body.item;
      res.json({ song: track.name, artist: track.artists[0].name, album: track.album.name, track_id: track.id });
    } else {
      res.json({ song: null });
    }
  });
});

app.listen(8888, () => {
  console.log('Server is running on http://localhost:8888');
});
