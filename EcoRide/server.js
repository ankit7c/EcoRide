const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
var bcrypt = require('bcrypt');
const path = require('path');

dotenv.config();

const app = express();


app.use(bodyParser.urlencoded({ extended: true }));

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  
   connection.connect((err) => {
    if (err) {
      console.error("Database connection failed:", err.stack);
      return;
    }
    console.log("Connected to GCP SQL database.");
  });


app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});


app.post('/register', function(req, res) {
    const { name, email, contact, password } = req.body;

    bcrypt.hash(password, 10, function(err, hash) {
        if (err) {
            res.status(500).send({ message: 'Error hashing password' });
            return;
        }

        const sql = 'SELECT MAX(userId) AS lastUserId FROM User';
        connection.query(sql, function(err, result) {
            if (err) {
                res.status(500).send({ message: 'Error fetching last user_id', error: err });
                return;
            }

            const lastUserId = result[0].lastUserId || 0;
            const newUserId = lastUserId + 1;

            const insertSql = `INSERT INTO User (userId, name, email, contact, password) VALUES (?, ?, ?, ?, ?)`;
            connection.query(insertSql, [newUserId, name, email,contact, hash], function(err, result) {
                if (err) {
                    res.status(500).send({ message: 'Error registering user', error: err });
                    return;
                }
                res.redirect(`/${name}/manage`);
            });
        });
    });
});


app.post('/login', function (req, res) {
    const { username, password } = req.body;

    const sql = 'SELECT * FROM User WHERE name = ?';
    connection.query(sql, [username], function (err, results) {
        if (err) {
            res.status(500).send({ message: 'Error fetching user data', error: err });
            return;
        }

        if (results.length === 0) {
            res.status(401).send({ message: 'Invalid username or password' });
            return;
        }

        const user = results[0];
        bcrypt.compare(password, user.password, function (err, isMatch) {
            if (err) {
                res.status(500).send({ message: 'Error comparing passwords' });
                return;
            }

            if (!isMatch) {
                res.status(401).send({ message: 'Invalid username or password' });
                return;
            }

            res.redirect(`/${username}/manage`);
        });
    });
});

app.get('/:username/manage', (req, res) => {
    const username = req.params.username;

    // Fetch user_id based on username
    const userSql = `SELECT userId FROM User WHERE name = ?`;
    connection.query(userSql, [username], (err, userResult) => {
        if (err || userResult.length === 0) {
            res.status(500).send('<h1>Error fetching user information.</h1>');
            return;
        }

        const userId = userResult[0].user_id;

        // Fetch all fantasy teams for this user
        const teamSql = `SELECT name, email, contact FROM User WHERE userId = ?`;
        connection.query(teamSql, [userId], (err, teamResults) => {
            if (err) {
                res.status(500).send('<h1>Error fetching fantasy teams.</h1>');
                return;
            }

            // Serve the Manage Fantasy Teams page
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>EcoRide</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            margin: 0;
                            background-color: #f4f4f4;
                        }
                        h1 {
                            color: #333;
                            margin-bottom: 20px;
                        }
                        .button {
                            background-color: #007BFF;
                            color: white;
                            border: none;
                            padding: 15px 20px;
                            margin: 10px;
                            border-radius: 5px;
                            font-size: 16px;
                            cursor: pointer;
                            text-decoration: none;
                            text-align: center;
                        }
                        .button:hover {
                            background-color: #0056b3;
                        }
                        ul {
                            list-style: none;
                            padding: 0;
                        }
                        li {
                            margin: 10px 0;
                            font-size: 18px;
                            color: #444;
                        }
                        .logout-btn {
                            position: absolute;
                            top: 20px;
                            right: 20px;
                            background-color: #ff4d4d;
                            color: white;
                            border: none;
                            padding: 10px 15px;
                            border-radius: 5px;
                            font-size: 14px;
                            cursor: pointer;
                            text-decoration: none;
                        }
                        .logout-btn:hover {
                            background-color: #ff1a1a;
                        }
                    </style>
                </head>
                <body>
                    <h1>Welcome ${username}! Happy riding!!</h1>
                    <a href="/" class="logout-btn">Logout</a>
                    <h1>Select your role</h1>
                    <a href="/${username}/buyer" class="button" type="submit">Buyer</a>
                    <a href="/${username}/seller/add-car" class="button" type="submit">Seller</a>
                </body>
                </html>
            `);
        });
    });
});

app.get('/:username/buyer', (req, res) => {
    const sql = 'SELECT * FROM Car WHERE availability=true'; // Query to fetch available cars
  
    connection.query(sql, (err, results) => {
      if (err) {
        res.status(500).send({ message: 'Error fetching car data', error: err });
        return;
      }
  
      // Generate HTML with Bootstrap-styled cards
      let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Available Cars</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body>
          <div class="container mt-5">
            <h1 class="mb-4 text-center">Available Cars</h1>
            <div class="row">
      `;
  
      // Append cards dynamically for each car
      results.forEach(car => {
        html += `
          <div class="col-md-4">
            <div class="card mb-4 shadow-sm">
              <div class="card-body">
                <h5 class="card-title">${car.carModel}</h5>
                <h6 class="card-subtitle mb-2 text-muted">${car.carCompany}</h6>
                <p class="card-text">
                  <strong>Mileage:</strong> ${car.mileage} <br>
                  <strong>Price:</strong> $${car.price}
                </p>
                <button class="btn btn-success">Book</button>
              </div>
            </div>
          </div>
        `;
      });
  
      // Close the HTML structure
      html += `
            </div>
            <a href="/" class="btn btn-primary mt-3">Go Back</a>
          </div>
        </body>
        </html>
      `;
  
      // Send the generated HTML as the response
      res.send(html);
    });
});
  

app.get('/:username/seller/add-car', (req, res) => {
    const { username } = req.params; // Extract the username from the route
    console.log(username)
    // Render the Add Car form
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Add a New Car</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
      </head>
      <body>
        <div class="container mt-5">
          <h1 class="mb-4 text-center">Add a New Car</h1>
          <form action="/${username}/seller/add-car" method="POST" class="p-4 border rounded shadow-sm">
            <div class="mb-3">
              <label for="carModel" class="form-label">Car Model</label>
              <input type="text" class="form-control" id="carModel" name="carModel" required>
            </div>
            <div class="mb-3">
              <label for="carCompany" class="form-label">Car Company</label>
              <input type="text" class="form-control" id="carCompany" name="carCompany" required>
            </div>
            <div class="mb-3">
              <label for="mileage" class="form-label">Mileage</label>
              <input type="text" class="form-control" id="mileage" name="mileage" required>
            </div>
            <div class="mb-3">
              <label for="price" class="form-label">Price</label>
              <input type="number" class="form-control" id="price" name="price" required>
            </div>
            <button type="submit" class="btn btn-primary">Add Car</button>
            <a href="/${username}/manage" class="btn btn-secondary">Cancel</a>
          </form>
        </div>
      </body>
      </html>
    `;
    console.log("Seller has started adding car this is just before post call")
    res.send(html);
});
  

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
