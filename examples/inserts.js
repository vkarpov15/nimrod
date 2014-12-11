db.dropDatabase();

for (var i = 0; i < 100; ++i) {
  db.users.insert({ x: i });
}