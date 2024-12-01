const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
var bcrypt = require('bcrypt');
const path = require('path');
const { kMaxLength } = require('buffer');


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
var isLogin = false;
app.get('/', (req, res) => {
  isLogin = false;
  res.render('start' , {isLogin}); 
});

app.get('/index', (req, res) => {
  isLogin = false;
  res.render('index', {isLogin}); 
});

app.get('/login', (req, res) => {
  isLogin = false;
  res.render('login', {isLogin}); 
});

app.get('/register', (req, res) => {
  isLogin = false;
  res.render('register', {isLogin}); 
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

            res.redirect(`/${username}/checkRole`);
        });
    });
});

app.get('/:username/checkRole', (req, res) => {
  const username = req.params.username;

  const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';

  connection.query(getUserIdQuery, [username], (err, results) => {
    if (err) {
      console.error('Error fetching user ID:', err);
      return res.status(500).send('Error fetching user ID');
    }

    if (results.length === 0) {
      return res.status(404).send('User not found');
    }

    const userId = results[0].userId; 

    const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

    connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
      if (err) {
        console.error('Error checking user role:', err);
        return res.status(500).send('Error checking user role');
      }
      console.log(roleResults)
      console.log(roleResults.length)
      if (roleResults.length > 0) {
        res.redirect(`/${username}/${roleResults[0].role}/profile?param=${roleResults.length}`);
      }else{
        res.redirect(`/${username}/manage`)
      }
    });
  });
});


app.get("/:username/manage", (req,res)=>{
  const username = req.params.username
  isLogin = true;
  res.render('manage',{username, isLogin});
})

app.get('/:username/addRole', (req, res) => {
  console.log("Reached ADD role")
  const { username } = req.params;
  const { role } = req.query;  
  console.log(role)
  console.log(typeof(role))
  if (role !== 'buyer' && role !== 'seller') {
    return res.status(400).send('Invalid role');
  }
  const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';
  connection.query(getUserIdQuery, [username], (err, results) => {
    if (err) {
      console.error('Error fetching user ID:', err);
      return res.status(500).send('Error fetching user ID');
    }

    if (results.length === 0) {
      return res.status(404).send('User not found');
    }

    const userId = results[0].userId; 
    console.log("Inside add role",userId)
    
    const getLatestUserRoleIdQuery = 'SELECT MAX(userRoleId) AS latestUserRoleID FROM UserRoles';
    // connection.query(getUserIdQuery, [username], (err, results) => {
    

      connection.query(getLatestUserRoleIdQuery, (err, result) => {
        if (err) {
          console.error('Error fetching latest UserRoleID:', err);
          return res.status(500).send('Error fetching latest UserRoleID');
        }
  
        const latestUserRoleID = result[0].latestUserRoleID || 0; // Get the latest UserRoleID, default to 0 if empty
        const newUserRoleID = latestUserRoleID + 1; // Increment the UserRoleID
  
        // Query to insert or update the role in the UserRoles table with the new UserRoleID
        const updateRoleQuery = `
          INSERT INTO UserRoles (userRoleID, userId, role) 
          VALUES (?, ?, ?);
        `;
        connection.query(updateRoleQuery, [newUserRoleID , userId, role], function(err, result) {
          if (err) {
              res.status(500).send({ message: 'Error registering user', error: err });
              return;
          }
          console.log(username)
          console.log(role)
          res.redirect(`/${username}/${role}/profile`);
      });
  
      });
  });
});


app.get('/:username/cars/book', (req, res) => {
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
      isLogin: isLogin,
      cars: results
    });
  });
});

app.get('/:username/car/:carId/book', (req, res) => {
  const { username, carId } = req.params;

  // Fetch car details based on carId
  const getCarQuery = 'SELECT * FROM Car WHERE carId = ?'; // Adjust table name as needed
  connection.query(getCarQuery, [carId], (err, result) => {
    if (err || result.length === 0) {
      res.status(500).send('Error fetching car details');
      return;
    }

    res.render('book-car', { username, car: result[0] });
  });
});

  

app.get('/:username/seller/add-car', (req, res) => {
  const { username } = req.params;
  isLogin = true;
  res.render('add-car', { username , isLogin });
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


app.get('/:username/:role/profile', (req, res) => {
  const { username, role } = req.params; 
  const { param } = req.query;  
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
      console.log(param)
      console.log(typeof(param))
      console.log(role)
      isLogin = true;
      res.render('profile1', { username, user, cars: carResults, role, param , isLogin});
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

