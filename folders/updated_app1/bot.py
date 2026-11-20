import utils
import logging
from pyrogram import Client,filters 
from pyrogram.types import Message
from pyrogram.enums import MessageEntityType

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
    text = None
 
    if message.text:
        text = message.text 

    if message.caption:
        text = message.caption
    



    if utils.contains_live_trade(text):
        link = ""
        for entity in message.entities:
        
            if entity.type == MessageEntityType.TEXT_LINK:
               link = entity.url
        eng_text = text.replace("xx","")
        eng_text = eng_text.replace("Market Chart",f"[Market Chart]({link})")
        await client.send_message(chat_id = -1001716677263,text= eng_text)
        text = utils.translate(text,lan_code='fr')
        text = text.replace("xx","")
        text = text.replace("Graphique du marché",f"[Graphique du marché]({link})")
        await client.send_message(chat_id=-1001727546393,text = text)



app.run()
