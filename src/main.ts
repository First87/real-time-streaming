import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files from the public folder
  app.useStaticAssets(join(__dirname, '..', 'public'));
  
  // Serve static files for CSS and JS
  app.useStaticAssets(join(__dirname, '..', 'public', 'css'), {
    prefix: '/css/',
  });
  app.useStaticAssets(join(__dirname, '..', 'public', 'js'), {
    prefix: '/js/',
  });

  // Enable CORS
  app.enableCors();

  const port = process.env.PORT || 9001; // Set a default port if PORT is not defined
  await app.listen(port);

  Logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
