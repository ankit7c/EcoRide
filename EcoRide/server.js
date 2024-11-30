const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
var bcrypt = require('bcrypt');
const path = require('path');


dotenv.config();


const app = express();
app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

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
  res.render('start'); 
});

app.get('/index', (req, res) => {
  res.render('index'); 
});

app.get('/login', (req, res) => {
  res.render('login')
});

app.get('/register', (req, res) => {
  res.render('register')
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
  const userSql = `SELECT userId FROM User WHERE name = ?`;
  connection.query(userSql, [username], (err, userResult) => {
      if (err || userResult.length === 0) {
          res.status(500).send('<h1>Error fetching user information.</h1>');
          return;
      }

      const userId = userResult[0].user_id;

      const teamSql = `SELECT name, email, contact FROM User WHERE userId = ?`;
      connection.query(teamSql, [userId], (err, teamResults) => {
          if (err) {
              res.status(500).send('<h1>Error fetching user details.</h1>');
              return;
          }
          res.render('manage', { username: username });
      });
  });
});


app.get('/:username/buyer', (req, res) => {
  const searchTerm = req.query.search || ''; 
  const sql = `
      SELECT * FROM Car 
      WHERE availability=true
      AND (carModel LIKE ? OR carCompany LIKE ?)
  `;

  connection.query(sql, [`%${searchTerm}%`, `%${searchTerm}%`], (err, results) => {
    if (err) {
      res.status(500).send({ message: 'Error fetching car data', error: err });
      return;
    }

    res.render('buyer', {
      username: req.params.username, 
      searchTerm: searchTerm,
      cars: results
    });
  });
});


  

app.get('/:username/seller/add-car', (req, res) => {
  const { username } = req.params;
  res.render('add-car', { username });
});
  
  
app.post('/:username/seller/add-car', (req, res) => {
  console.log("Seller has started adding car")
  const { carModel, mileage, price, availability, carCompany } = req.body; 
  const { username } = req.params; 
  var availabilityBool = availability.toLowerCase() === "true";
  const getLastCarId = 'SELECT MAX(carId) AS lastCarId FROM Car';
  
  const getUserId = 'SELECT userId FROM User WHERE name = ?';
  
  const insertCar = `
    INSERT INTO Car (carId, userId, price, mileage, availability, carCompany, carModel)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
    
  connection.query(getLastCarId, (err, result) => {
    if (err) {
      res.status(500).send({ message: 'Error fetching last carId', error: err });
      return;
    }

    const newCarId = (result[0].lastCarId || 0) + 1; 

    connection.query(getUserId, [username], (err, userResult) => {
      if (err) {
        res.status(500).send({ message: 'Error fetching userId', error: err });
        return;
      }

      if (userResult.length === 0) {
        res.status(400).send({ message: 'User not found' });
        return;
      }

      const userId = userResult[0].userId;

      connection.query(
        insertCar,
        [newCarId, userId, price, mileage, availabilityBool, carCompany, carModel],
        (err, insertResult) => {
          if (err) {
            res.status(500).send({ message: 'Error adding car to the database', error: err });
            return;
          }

          res.redirect(`/${username}/profile`);
        }
      );
    });
  });
});  


app.get('/:username/profile', (req, res) => {
  const { username } = req.params;

  const getUserDetails = 'SELECT userId, name, email FROM User WHERE name = ?';
  
  const getUserCars = 'SELECT * FROM Car WHERE userId = (SELECT userId FROM User WHERE name = ?)';

  connection.query(getUserDetails, [username], (err, userResult) => {
    if (err || userResult.length === 0) {
      res.status(500).send({ message: 'Error fetching user details or user not found', error: err });
      return;
    }

    const user = userResult[0];

    connection.query(getUserCars, [username], (err, carResults) => {
      if (err) {
        res.status(500).send({ message: 'Error fetching user cars', error: err });
        return;
      }

      res.render('profile', { username, user, cars: carResults });
    });
  });
});
  

app.post('/:username/seller/:carId/delete', (req, res) => {
  const { username, carId } = req.params;
  console.log("inside post request to delete",carId)
  // Query to delete the car based on carId
  const deleteCarQuery = 'DELETE FROM Car WHERE carId = ?';

  connection.query(deleteCarQuery, [carId], (err, result) => {
    if (err) {
      res.status(500).send({ message: 'Error deleting car', error: err });
      return;
    }

    res.redirect(`/${username}/profile`);
  });
});
  
app.get('/:username/car/:carId/edit', (req, res) => {
  
  console.log("i'm inside edit car")
  const { username, carId } = req.params;

  const getCarQuery = 'SELECT carModel, carCompany, mileage, price, availability FROM Car WHERE carId = ?';

  connection.query(getCarQuery, [carId], (err, results) => {
    if (err) {
      res.status(500).send({ message: 'Error fetching car details', error: err });
      return;
    }
    if (results.length === 0) {
      res.status(404).send({ message: 'Car not found' });
      return;
    }
    const car = results[0]; 
    res.render('edit-car', { 
      username, 
      carId, 
      carModel: car.carModel, 
      carCompany: car.carCompany, 
      mileage: car.mileage, 
      price: car.price, 
      availability: car.availability 
    });
  });
});

app.post('/:username/car/:carId/edit', (req, res) => {
  const { username, carId } = req.params;
  const { carModel, carCompany, mileage, price, availability } = req.body;

  const updateCarQuery = `
    UPDATE Car
    SET carModel = ?, carCompany = ?, mileage = ?, price = ?, availability = ?
    WHERE carId = ?
  `;

  connection.query(
    updateCarQuery, 
    [carModel, carCompany, mileage, price, availability, carId],
    (err, results) => {
      if (err) {
        res.status(500).send({ message: 'Error updating car details', error: err });
        return;
      }

      if (results.affectedRows === 0) {
        res.status(404).send({ message: 'Car not found' });
        return;
      }
      res.redirect(`/${username}/profile`);
    }
  );
});
  
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
