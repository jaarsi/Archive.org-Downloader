FROM python:3.12
ENV TZ=America/Sao_Paulo
RUN apt update && apt upgrade -y
COPY requirements.txt /tmp
RUN pip install -r /tmp/requirements.txt
WORKDIR /app
COPY . .
ENTRYPOINT [ "streamlit", "run", "--server.headless=1", "--server.port=8001", "index.py" ]
