FROM python:3.11.3-alpine 

WORKDIR /app

RUN apk add git 

COPY requirements.txt /app 

RUN pip3 install -r requirements.txt 

COPY . /app 

CMD ["python3","bot.py"]