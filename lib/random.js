module.exports = {
  rand: function() { return Math.random(); },
  srand: function(seed) { /* We can't seed RNG's in Javascript, unfortunately */ }
};
