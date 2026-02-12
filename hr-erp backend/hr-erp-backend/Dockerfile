FROM node:20-alpine

# Munkamappa beállítása
WORKDIR /app

# Package fájlok másolása
COPY package*.json ./

# Függőségek telepítése
RUN npm ci --only=production && \
    npm cache clean --force

# Alkalmazás fájlok másolása
COPY . .

# Logs és uploads mappák létrehozása
RUN mkdir -p logs uploads

# Port expose
EXPOSE 3000

# Felhasználó váltás (security)
USER node

# Alkalmazás indítása
CMD ["npm", "start"]
