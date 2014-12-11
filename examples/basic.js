var users = db.users.find();

print('\n\n-------\n\n');

while (users.hasNext()) {
  var user = users.next();
  print(user._id + ': ' + user.x);
}

print('\n\n--------\n\n');
