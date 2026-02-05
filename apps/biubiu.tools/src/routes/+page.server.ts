
import { env } from '$env/dynamic/private';
console.log("PORT =>", env.PORT);
console.log("DATABASE_URL =>", env.DATABASE_URL);
console.log("API_KEY =>", env.API_KEY);
console.log("PUBLIC_APP_NAME =>", env.PUBLIC_APP_NAME);       
