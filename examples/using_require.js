var moment = require('moment');

db.users.update(
  {},
  {
    $set: {
      expiresAt: moment().add(3, 'days').toDate()
    }
  },
  { multi: true });

var user = db.users.findOne();
print('------\n\n');
print(user.expiresAt);
print('\n\n------\n\n');