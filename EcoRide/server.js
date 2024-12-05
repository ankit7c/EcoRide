const express = require('express');
const bodyParser = require('body-parser');
var bcrypt = require('bcrypt');
const path = require('path');
const { kMaxLength } = require('buffer');
const moment = require('moment');
const app = express();
app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
const connection = require('./db');
const { checkUserRole, getUserIdByUsername, getBookingsByUserId, getUserDetailsByName, getUserCarsByUserName, updateEcoPointsForUser, addToCarRating} = require('./utils/help');


app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
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

            res.redirect(`/${username}/checkRole`);
        });
    });
});

app.get('/:username/checkRole', (req, res) => {
  const username = req.params.username;
  getUserIdByUsername(username, (err,resultUser)=>{
    const userId = resultUser
    const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';
    
    connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
      if (err) {
        console.error('Error checking user role:', err);
        return res.status(500).send('Error checking user role');
      }
      if (roleResults.length > 0) {
            res.redirect(`/${username}/${roleResults[0].role}/profile?param=${roleResults.length}`)
      }else{
        res.redirect(`/${username}/manage`)
      }
    });
  })
});

app.get('/:username/:role/profile', (req, res) => {
  var { param } = req.query; 
  const { username, role } = req.params; 
  getUserDetailsByName(username, (err, resultUser)=>{
    const user = resultUser
    getUserCarsByUserName(user.userId,(err, carResults)=>{
      const cars = carResults
      getBookingsByUserId(user.userId, (err, resultBooking)=>{
        const bookingResults = resultBooking
        const rewardQuery = 'SELECT points FROM EcoPoints where userId =?'
        connection.query(rewardQuery,[user.userId], (err,resReward)=>{
          var pts = 0
          if (resReward && resReward.length > 0) {  
            pts = resReward[0].points;
          } else {
            pts = 0;  
          }
          checkUserRole(user.userId, (err,resultRole)=>{
            param = resultRole.length
            const role = param>1? "seller":"buyer"
            res.render('profile',{username, user, role, param, cars, bookingResults, pts})
          })
        })
      })
    })
  })
});





app.get("/:username/manage", (req,res)=>{
  const username = req.params
  res.render('manage',username)
})

// can be updated in future with the param value 
app.get('/:username/addRole', (req, res) => {
  const { username } = req.params;
  const { role } = req.query;  
  if (role !== 'buyer' && role !== 'seller') {
    return res.status(400).send('Invalid role');
  }
  getUserIdByUsername(username, (err, resultUser)=>{
    const userId = resultUser 
    const getLatestUserRoleIdQuery = 'SELECT MAX(userRoleId) AS latestUserRoleID FROM UserRoles';
    connection.query(getLatestUserRoleIdQuery, (err, result) => {
      if (err) {
        console.error('Error fetching latest UserRoleID:', err);
        return res.status(500).send('Error fetching latest UserRoleID');
      }

      const latestUserRoleID = result[0].latestUserRoleID || 0; 
      const newUserRoleID = latestUserRoleID + 1
      const updateRoleQuery = `INSERT INTO UserRoles (userRoleID, userId, role) VALUES (?, ?, ?);`;
      connection.query(updateRoleQuery, [newUserRoleID , userId, role], function(err, result) {
        if (err) {
            res.status(500).send({ message: 'Error registering user', error: err });
            return;
        }
        checkUserRole(userId, (err,resultRole)=>{
          res.redirect(`/${username}/${role}/profile?param=${resultRole.length}`);
        })
      })
    })  
  });
});


app.get('/:username/cars/book', (req, res) => {
  const searchTerm = req.query.search || ''; 
  const sql = `
      SELECT c.userId, c.carId,c.mileage,c.price,c.carCompany,c.carModel,ROUND(avg(cr.ratingValue),1) as ratingValue
      FROM Car c
      LEFT JOIN CarRating cr ON c.carId=cr.carId
      WHERE availability=true
      AND (carModel LIKE ? OR carCompany LIKE ?)
      Group by c.carId;
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

app.post('/:username/car/:carId/book/confirm', (req, res) => {
  const { hours } = req.body;
  const { username, carId } = req.params;
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);

  const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';

  const getMileageQuery = 'SELECT mileage FROM Car WHERE carId = ?';

  const getMaxBookingIdQuery = 'SELECT MAX(bookingId) AS maxId FROM Booking';

  connection.query(getUserIdQuery, [username], (err, userResult) => {
    if (err || userResult.length === 0) {
      return res.status(500).send({ message: 'Error fetching user ID or user not found', error: err });
    }
    const userId = userResult[0].userId;

    connection.query(getMileageQuery, [carId], (err, carResult) => {
      if (err || carResult.length === 0) {
        return res.status(500).send({ message: 'Error fetching car mileage or car not found', error: err });
      }

      const startMileage = carResult[0].mileage;

      connection.query(getMaxBookingIdQuery, (err, result) => {
        if (err) {
          return res.status(500).send({ message: 'Error fetching booking ID', error: err });
        }

      const nextBookingId = (result[0].maxId || 0) + 1;

      const insertQuery = `
        INSERT INTO Booking (bookingId, carId, userId, startDate, endDate, startMileage, endMileage, tripStatus)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      connection.query(
        insertQuery,
        [nextBookingId, carId, userId, startTime, endTime, startMileage, startMileage, 0],
        (err, result) => {
          if (err) {
            return res.status(500).send({ message: 'Error inserting booking', error: err });
          }
          const updateAvailability = `UPDATE Car SET availability=false where carId = ?`
          connection.query(updateAvailability, [carId], (updateErr, updateResult) => {
            if (updateErr) {
              console.error("Error updating car availability:", updateErr);
              return res.status(500).send({ message: "Error updating car availability", error: updateErr });
            }
          });


          const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

          connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
            if (err) {
              console.error('Error checking user role:', err);
              return res.status(500).send('Error checking user role');
            }
            if (roleResults.length > 0) {
              res.redirect(`/${username}/${roleResults[0].role}/profile?param=${roleResults.length}`);
            }
          });
        });
      });
    });
  });
});

  

app.get('/:username/seller/add-car', (req, res) => {
  const { username } = req.params;
  res.render('add-car', { username });
});
  
  
app.post('/:username/seller/add-car', (req, res) => {
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

          const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

          connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
            if (err) {
              console.error('Error checking user role:', err);
              return res.status(500).send('Error checking user role');
            }
            
              if (roleResults.length > 0) {
              res.redirect(`/${username}/seller/profile?param=${roleResults.length}`);
              }
          });
        }
      );
    });
  });
});  
      

app.post('/:username/seller/:carId/delete', (req, res) => {
  const { username, carId } = req.params;
  // Query to delete the car based on carId
  const deleteCarQuery = 'DELETE FROM Car WHERE carId = ?';

  connection.query(deleteCarQuery, [carId], (err, result) => {
    if (err) {
      res.status(500).send({ message: 'Error deleting car', error: err });
      return;
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

      const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';

      connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
        if (err) {
          console.error('Error checking user role:', err);
          return res.status(500).send('Error checking user role');
        }
      
        if (roleResults.length > 0) {
        res.redirect(`/${username}/seller/profile?param=${roleResults.length}`);
        }
      });
    });
  });
});
  
app.get('/:username/car/:carId/edit', (req, res) => {
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
        
          if (roleResults.length > 0) {
          res.redirect(`/${username}/seller/profile?param=${roleResults.length}`);
          }
        });
      });
    }
  );
});

app.get('/:username/car/:carId/:carCompany/:carModel/end-ride', (req, res) => {
  const { username, carId, carCompany, carModel } = req.params;

  const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';
  
  connection.query(getUserIdQuery, [username], (err, userResult) => {
    if (err || userResult.length === 0) {
      return res.status(500).send({ message: 'Error fetching user details or user not found', error: err });
    }

    const userId = userResult[0].userId;

    const getBookingDetailsQuery = `
      SELECT bookingId, startDate, endDate, startMileage, endMileage 
      FROM Booking 
      WHERE carId = ? AND userId = ? AND tripStatus = 0
    `;

    connection.query(getBookingDetailsQuery, [carId, userId], (err, bookingResult) => {
      if (err) {
        return res.status(500).send({ message: 'Error fetching booking details', error: err });
      }

      if (bookingResult.length === 0) {
        return res.status(404).send({ message: 'No ongoing trip found for this car and user' });
      }
      const getCarPrice = 'SELECT price FROM Car WHERE carId = ?'
      connection.query(getCarPrice, [carId], (err, carPrice)=>{
        if (err) {
          return res.status(500).send({ message: 'Error fetching car price', error: err })
        }
        const booking = bookingResult[0];
        const price = carPrice[0].price
        res.render('end-ride', { username, carId, carCompany, carModel, price, booking });

      })

      
    });
  });
});


app.post('/:username/car/:carId/end-ride/:bookingId', (req, res) => {
  const { username, carId, bookingId } = req.params;
  const endMileage = parseFloat(parseFloat(req.body.endMileage).toFixed(2));
  const rating = parseFloat(req.body.rating);
  try {
    const getStartMileageQuery = 'SELECT mileage, price from Car WHERE carId = ?';
    connection.query(getStartMileageQuery,carId,(err,resultMil)=>{
      const startMileage = parseFloat(parseFloat(resultMil[0].mileage).toFixed(2));
      const mileageDifference = endMileage - startMileage;
      const updatedMileage = (endMileage + startMileage) / 2;
      const updateAvailabilityQuery = 'UPDATE Car SET availability = 1, mileage=? WHERE carId = ?';
      connection.query(updateAvailabilityQuery, [updatedMileage,carId], (err,results)=>{
        getUserIdByUsername(username,(err,resultUserId)=>{
          const userId = resultUserId
          // buyer ecopoints
          if(mileageDifference>5)
          {
            updateEcoPointsForUser(userId, (err, updateEco)=>{})
          }
          // seller ecopoints
          if(rating>=4)
          {
            const carUserQuery = 'SELECT userId FROM Car WHERE carId = ?'
            connection.query(carUserQuery,[carId],(err,carUser)=>{
              const carUserId = carUser[0].userId
              updateEcoPointsForUser(carUserId, (err, updateSellerEco)=>{})
            })
          }
          getBookingsByUserId(userId,(err,resbook)=>{
            const getBookingDetailsByBookingIdQuery ='SELECT * FROM Booking WHERE bookingId = ?'
            connection.query(getBookingDetailsByBookingIdQuery, [bookingId],(err, bookResOne)=>{
              
              const startDateTime = new Date(bookResOne[0].startDate);  
              const endDateTime = new Date(bookResOne[0].endDate);      
              const returnDateTime = new Date();
              
              const basePricePerHour = resultMil[0].price
              const billingEndTime = returnDateTime <= endDateTime ? endDateTime : returnDateTime; 
              const billingDurationMs = billingEndTime - startDateTime;
              const billingDurationHours = Math.ceil(billingDurationMs / (1000 * 60 * 60));
              const basePrice = billingDurationHours * basePricePerHour;

              let fine = 0;  
              if (returnDateTime > endDateTime) {
                const overtimeMs = returnDateTime - endDateTime;
                const overtimeHours = Math.ceil(overtimeMs / (1000 * 60 * 60));
                fine = overtimeHours * 5; 
              }
              const totalPrice = basePrice + fine;
              const updateBookingQuery = 'UPDATE Booking SET tripStatus = 1, endDate = NOW(), tripCost=?, endMileage=? WHERE bookingId = ?';
              connection.query(updateBookingQuery, [totalPrice,endMileage,bookingId],(err,resultsT)=>{
                checkUserRole(userId, (err,resultRole)=>{
                  const roleLen = resultRole.length
                  const role = roleLen>1? "seller":"buyer"
                  addToCarRating(carId, userId, bookingId, rating,(err, resRating)=>{

                    res.redirect(`/${username}/${role}/profile?param=${roleLen}`);
                  })  
                });
              })
            })
          })
        });
      })
    });
  }catch (err) {
    console.error('Error ending ride:', err);
    res.status(500).send({ message: 'Error processing ride completion', error: err });
  }
});





app.get('/:username/eco-points/:pts', (req, res) => {
  const {username} = req.params;
  const pts = parseInt(req.params.pts, 0);
  getUserIdByUsername(username, (err,resUser)=>{
    checkUserRole(resUser, (err,resultRole)=>{
      const param = resultRole.length
      const role = param>1? "seller":"buyer"
      res.render('eco-points', { username, param, role, pts });
    })
  })
  
});

app.get('/:username/:role/claim-service',(req,res)=>{
  const {username} = req.params
  getUserIdByUsername(username, (err,resultUserId)=>{
    const userId = resultUserId
    const getUserEcoPtsQuery = 'SELECT points FROM EcoPoints WHERE userId = ?'
    connection.query(getUserEcoPtsQuery,[userId],(err,resPts)=>{
      const getOldPts = resPts[0].points
      const newEcoPts = getOldPts-100
      const updateEcoPts = 'UPDATE EcoPoints SET points=? WHERE userId=?'
      connection.query(updateEcoPts, [newEcoPts,userId],(err,resUpdate)=>{
        checkUserRole(userId, (err,resultRole)=>{
          const param1 = resultRole.length
          const role = param1>1? "seller":"buyer"
          res.redirect(`/${username}/${role}/profile?param=${param1}`)
        })
      })
    })
  })
})



  
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});














