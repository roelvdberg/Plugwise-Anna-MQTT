FROM node:8.12.0-alpine

WORKDIR /
COPY . .

RUN npm install
# RUN npm install --quiet

CMD [ "npm", "start" ]