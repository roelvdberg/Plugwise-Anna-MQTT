FROM node:17.1.0

WORKDIR /
COPY . .

RUN npm install
# RUN npm install --quiet

CMD [ "npm", "start" ]
