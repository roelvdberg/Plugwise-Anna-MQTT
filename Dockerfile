FROM node:17.1.0

WORKDIR /
COPY index.js .
COPY package-lock.json .
COPY package.json .

RUN npm install
# RUN npm install --quiet

CMD [ "npm", "start" ]