const app = require('./app');
const { PORT } = require('./config/env');

app.listen(PORT, () => {
  console.log(`Donna Style corriendo en http://localhost:${PORT}`);
});
