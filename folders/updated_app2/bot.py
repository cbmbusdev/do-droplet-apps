import asyncio 
import utils
import logging
from pyrogram import Client,filters 
from pyrogram.types import Message
from pyrogram.enums import MessageEntityType
from pyrogram.errors import FloodWait

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


from config import Credentials


app = Client(name=str(Credentials.PHONE_NUMBER),api_id = Credentials.API_ID,api_hash=Credentials.API_HASH,phone_number=Credentials.PHONE_NUMBER)


@app.on_message(filters.chat(Credentials.SOURCE))
async def message_forwarder(client:Client,message:Message):
    logger.info("incoming mesage on source")
    eng_text = None 
 
    if message.text:
        eng_text = message.text 

    if message.caption:
        eng_text = message.caption
    

    async def send_message_in_language(client, eng_text, link, language_code, chat_id, replacement_text):
        try:
            translated_text = utils.translate(eng_text, language_code)
            translated_text = translated_text.replace(replacement_text, f"[{replacement_text}]({link})")
            translated_text = translated_text.replace("xx","")
            await client.send_message(chat_id=chat_id, text=translated_text)
        except FloodWait as e:
            await asyncio.sleep(e.value)
            send_message_in_language(client, eng_text, link, language_code, chat_id, replacement_text)
        except Exception as e:
            print(f"Error sending message in {language_code}: {str(e)}")

    link = None 
    if utils.contains_live_trade(eng_text):
        link = ""
        for entity in message.entities:
        
            if entity.type == MessageEntityType.TEXT_LINK:
               link = entity.url


    if not link:
        return
        


    languages = [
        {"code": "zh-CN", "replacement": "市场图表", "chat_id": -1001603876871},
        {"code": "hi", "replacement": "बाज़ार चार्ट", "chat_id": -1001968374987},
        {"code": "es", "replacement": "Gráfico de mercado", "chat_id": -1001967102248},
        {"code": "ar", "replacement": "مخطط السوق", "chat_id": -1001834832881},
        {"code": "pt", "replacement": "Gráfico de mercado", "chat_id": -1001808225555},
        {"code": "de", "replacement": "Marktdiagramm", "chat_id": -1001691947406},
        {"code": "id", "replacement": "Bagan Pasar", "chat_id": -1001680767391},
        {"code": "ru", "replacement": "График рынка", "chat_id": -1001935574963},
        {"code": "fa", "replacement": "نمودار بازار", "chat_id": -1001977282644},
        {"code": "bn", "replacement": "মার্কেট চার্ট", "chat_id": -1001907958732},
        {"code": "ja", "replacement": "マーケットチャート", "chat_id": -1001981722418},
        {"code": "tr", "replacement": "Piyasa Grafiği", "chat_id": -1001833700983},
        {"code": "vi", "replacement": "Biểu đồ thị trường", "chat_id": -1001933912583},
        {"code": "ko", "replacement": "시장 차트", "chat_id": -1001866826313},
        {"code": "it", "replacement": "Grafico del mercato", "chat_id": -1001868063964},
        {"code": "uk", "replacement": "Діаграма ринку", "chat_id": -1001919151335},
        {"code": "th", "replacement": "แผนภูมิตลาด", "chat_id": -1001878897497},
        {"code": "pl", "replacement": "Wykres rynku", "chat_id": -1001649301490},
    ]


    for language in languages:
        await send_message_in_language(client, eng_text, link, language["code"], language["chat_id"], language["replacement"])




app.run()


