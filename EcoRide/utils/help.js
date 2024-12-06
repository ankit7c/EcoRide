const express = require('express');
const connection = require('../db'); // Use 'mysql2' for Promises-based API



function checkUserRole(userId, callback) {
    const checkUserRoleQuery = 'SELECT role FROM UserRoles WHERE userId = ?';
  
    connection.query(checkUserRoleQuery, [userId], (err, roleResults) => {
      if (err) {
        console.error('Error checking user role:', err);
        return callback(err, null);
      }
  
      if (roleResults.length === 0) {
        return callback(new Error('User role not found'), null);
      }
      return callback(null, roleResults);
    });
  }
  

function getUserIdByUsername(username, callback) {
    const getUserIdQuery = 'SELECT userId FROM User WHERE name = ?';

    connection.query(getUserIdQuery, [username], (err, results) => {
        if (err) {
            console.error('Error fetching user ID:', err);
            return callback(err, null);
        }

        if (results.length === 0) {
            return callback(new Error('User not found'), null);
        }
        return callback(null, results[0].userId);
    });
}
function getBookingsByUserId(userId, callback) {
    const getBookingsQuery = `
      SELECT b.startDate, b.endDate, b.endMileage, c.carModel, c.carCompany, c.price, c.carId, b.tripStatus, b.tripCost
      FROM Booking b
      INNER JOIN Car c ON b.carId = c.carId
      INNER JOIN User u ON b.userId = u.userId
      WHERE u.userId = ?
    `;
  
    connection.query(getBookingsQuery, [userId], (err, results) => {
      if (err) {
        console.error('Error fetching bookings:', err);
        return callback(err, null);
      }
  
      if (results.length === 0) {
        return callback(new Error('No bookings found for the user'), null);
      }

      return callback(null, results);
    });
  }
  

function getUserDetailsByName(name, callback) {
    const getUserDetailsQuery = 'SELECT userId, name, email FROM User WHERE name = ?';

    connection.query(getUserDetailsQuery, [name], (err, results) => {
        if (err) {
        console.error('Error fetching user details:', err);
        return callback(err, null);
        }

        if (results.length === 0) {
        return callback(new Error('User not found'), null);
        }
        return callback(null, results[0]);
    });
}


function getUserCarsByUserName(userId, callback) {
  const getUserCarsQuery = 'SELECT * FROM Car WHERE userId = ?';

  connection.query(getUserCarsQuery, [userId], (err, carResults) => {
    if (err) {
      console.error('Error fetching car details:', err);
      return callback(err, null); // Pass the error through the callback
    }

    if (carResults.length === 0) {
      return callback(new Error('No cars found for this user'), null); // Handle the empty result case
    }
    return callback(null, carResults); // Pass the results through the callback
  });
}



function updateEcoPointsForUser(userId, callback) {

      const getEcoPointsQuery = 'SELECT points FROM EcoPoints WHERE userId = ?';
      connection.query(getEcoPointsQuery, [userId], (err, results) => {
          if (err) {
              console.error('Error fetching eco points:', err);
              return callback(err, null);
          }
          if (results.length > 0) 
          {
            const currentPoints = results[0].points;
            const updatedPoints = currentPoints + 50;
            const updateEcoPointsQuery = 'UPDATE EcoPoints SET points = ? WHERE userId = ?';
            connection.query(updateEcoPointsQuery, [updatedPoints, userId], (err) => {
                if (err) {
                    console.error('Error updating eco points:', err);
                    return callback(err, null);
                }
                console.log('Eco points updated successfully!');
                return callback(null, 'Eco points updated successfully');
            });
          } 
          else 
          {
              const lastEcoPoints= 'SELECT MAX(ecoPointsId) AS lastRoleId FROM EcoPoints'
              connection.query(lastEcoPoints,(err, result)=>{
                const lastEcoPtId = result[0].lastRoleId || 0;
                const newEcoPtId = lastEcoPtId + 1;
                const insertEcoPointsQuery = `
                  INSERT INTO EcoPoints (ecoPointsId, userId, points)
                  VALUES (?, ?, 50)
                `;
                connection.query(insertEcoPointsQuery, [newEcoPtId,userId], (err) => {
                    if (err) {
                        console.error('Error inserting eco points:', err);
                        return callback(err, null);
                    }
                    console.log('Eco points inserted successfully!');
                    return callback(null, 'Eco points inserted successfully');
                });
              })
              
          }
      });
  // } else {
      // return callback(null, 'No points awarded, mileage difference is not sufficient');
  // }
}


function addToCarRating(carId, userId, bookingId, ratingValue, callback) {
  const getMaxRatingIdQuery = 'SELECT MAX(ratingId) AS maxRatingId FROM CarRating';

  connection.query(getMaxRatingIdQuery, (err, results) => {
    if (err) {
      console.error('Error fetching the rating ID:', err);
      return callback(err); 
    }

    const maxRatingId = results[0].maxRatingId || 0; 
    const newRatingId = maxRatingId + 1;

    const insertRatingQuery = 'INSERT INTO CarRating (ratingId, carId, userId, bookingId, ratingValue) VALUES (?, ?, ?, ?, ?)';

    connection.query(insertRatingQuery, [newRatingId, carId, userId, bookingId, ratingValue], (err, result) => {
      if (err) {
        console.error('Error inserting the rating:', err);
        return callback(err); 
      }
      callback(null, result); 
    });
  });
}

function deleteRatingEntry(carId, callback) {
  const deleteRatingQuery = 'DELETE FROM CarRating WHERE carId = ?';
  
  connection.query(deleteRatingQuery, [carId], (err, result) => {
    if (err) {
      console.error('Error deleting rating entry:', err);
      return callback(err, null);  // Pass the error to the callback
    }
    callback(null, result);  // Pass the result to the callback
  });
}


function deleteCarEntry(carId, callback) {
  const deleteCarQuery = 'DELETE FROM Car WHERE carId = ?';

  connection.query(deleteCarQuery, [carId], (err, result) => {
    if (err) {
      console.error('Error deleting car entry:', err);
      return callback(err, null); // Pass the error to the callback
    }
    callback(null, result); // Pass the result to the callback
  });
}


  
module.exports = {
    checkUserRole,
    getUserIdByUsername,
    getBookingsByUserId,
    getUserDetailsByName,
    getUserCarsByUserName,
    updateEcoPointsForUser,
    addToCarRating,
    deleteRatingEntry,
    deleteCarEntry
};
