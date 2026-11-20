import asyncio 
import utils
import logging
from pyrogram import Client,filters 
from pyrogram.errors import FloodWait
from pyrogram.types import Message


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


from config import Credentials


app = Client(name=str(Credentials.PHONE_NUMBER),api_id = Credentials.API_ID,api_hash=Credentials.API_HASH,phone_number=Credentials.PHONE_NUMBER)


async def send_photo(photo_id,caption,target,code):
    try:
        caption_tr = utils.translate(caption,code)
        await app.send_photo(chat_id=target,caption=caption_tr,photo=photo_id)
    
    except FloodWait as e:
        await asyncio.sleep(e.value)
        logger.info(f"ERROR: Floodwait")
        await send_photo(photo_id,caption,target,code)
    
    except:
        pass 



async def send_video(video_id,caption,target,code):
    try:
        caption_tr = utils.translate(caption,code)
        await app.send_video(chat_id=target,caption=caption_tr,video=video_id)
    
    except FloodWait as e:
        await asyncio.sleep(e.value)
        logger.info(f"ERROR: Floodwait")
        await send_video(video_id,caption,target,code)
    
    except:
        pass 



async def send_document(document_id,caption,target,code):
    try:
        caption_tr = utils.translate(caption,code)
        await app.send_document(chat_id=target,caption=caption_tr,document=document_id)
    
    except FloodWait as e:
        await asyncio.sleep(e.value)
        logger.info(f"ERROR: Floodwait")
        await send_document(document_id,caption,target,code)
    
    except:
        pass 





@app.on_message(filters.chat(Credentials.SOURCE) & filters.photo)
async def photo_forward(client:Client,message:Message):
    caption = message.caption
    if not caption:
        caption = ""

    languages = [
        {"code": "zh-CN", "chat_id": "freemiumtradeideaszh"},
        {"code": "hi", "chat_id": "freemiumtradeideashi"},
        {"code": "es", "chat_id": "freemiumtradeideases"},
        {"code": "ar", "chat_id": "freemiumtradeideasar"},
        {"code": "pt", "chat_id": "freemiumtradeideaspt"},
        {"code": "de", "chat_id": "freemiumtradeideasde"},
        {"code": "id", "chat_id": "freemiumtradeideasid"},
        {"code": "ru", "chat_id": "freemiumtradeideasru"},
        {"code": "fa", "chat_id": "freemiumtradeideasfa"},
        {"code": "bn", "chat_id": "freemiumtradeideasbn"},
        {"code": "ja", "chat_id": "freemiumtradeideasja"},
        {"code": "tr", "chat_id": "freemiumtradeideastr"},
        {"code": "vi", "chat_id": "freemiumtradeideasvi"},
        {"code": "ko", "chat_id": "freemiumtradeideasko"},
        {"code": "it", "chat_id": "freemiumtradeideasit"},
        {"code": "uk", "chat_id": "freemiumtradeideasuk"},
        {"code": "th", "chat_id": "freemiumtradeideasth"},
        {"code": "pl", "chat_id": "freemiumtradeideaspl"},
        {"code": "fr", "chat_id": "freemiumtradeideasfr"},   
    ]

    for language in languages:
        await send_photo(photo_id=message.photo.file_id, caption=caption,target=language["chat_id"], code = language["code"])
    


@app.on_message(filters.chat(Credentials.SOURCE) & filters.video)
async def photo_forward(client:Client,message:Message):
    caption = message.caption
    if not caption:
        caption = ""

    languages = [
        {"code": "zh-CN", "chat_id": "freemiumtradeideaszh"},
        {"code": "hi", "chat_id": "freemiumtradeideashi"},
        {"code": "es", "chat_id": "freemiumtradeideases"},
        {"code": "ar", "chat_id": "freemiumtradeideasar"},
        {"code": "pt", "chat_id": "freemiumtradeideaspt"},
        {"code": "de", "chat_id": "freemiumtradeideasde"},
        {"code": "id", "chat_id": "freemiumtradeideasid"},
        {"code": "ru", "chat_id": "freemiumtradeideasru"},
        {"code": "fa", "chat_id": "freemiumtradeideasfa"},
        {"code": "bn", "chat_id": "freemiumtradeideasbn"},
        {"code": "ja", "chat_id": "freemiumtradeideasja"},
        {"code": "tr", "chat_id": "freemiumtradeideastr"},
        {"code": "vi", "chat_id": "freemiumtradeideasvi"},
        {"code": "ko", "chat_id": "freemiumtradeideasko"},
        {"code": "it", "chat_id": "freemiumtradeideasit"},
        {"code": "uk", "chat_id": "freemiumtradeideasuk"},
        {"code": "th", "chat_id": "freemiumtradeideasth"},
        {"code": "pl", "chat_id": "freemiumtradeideaspl"},
        {"code": "fr", "chat_id": "freemiumtradeideasfr"},   

    ]

    for language in languages:
        await send_video(video_id=message.video.file_id, caption=caption,target=language["chat_id"], code = language["code"])
    


@app.on_message(filters.chat(Credentials.SOURCE) & filters.document)
async def photo_forward(client:Client,message:Message):
    caption = message.caption
    if not caption:
        caption = ""

    languages = [
        {"code": "zh-CN", "chat_id": "freemiumtradeideaszh"},
        {"code": "hi", "chat_id": "freemiumtradeideashi"},
        {"code": "es", "chat_id": "freemiumtradeideases"},
        {"code": "ar", "chat_id": "freemiumtradeideasar"},
        {"code": "pt", "chat_id": "freemiumtradeideaspt"},
        {"code": "de", "chat_id": "freemiumtradeideasde"},
        {"code": "id", "chat_id": "freemiumtradeideasid"},
        {"code": "ru", "chat_id": "freemiumtradeideasru"},
        {"code": "fa", "chat_id": "freemiumtradeideasfa"},
        {"code": "bn", "chat_id": "freemiumtradeideasbn"},
        {"code": "ja", "chat_id": "freemiumtradeideasja"},
        {"code": "tr", "chat_id": "freemiumtradeideastr"},
        {"code": "vi", "chat_id": "freemiumtradeideasvi"},
        {"code": "ko", "chat_id": "freemiumtradeideasko"},
        {"code": "it", "chat_id": "freemiumtradeideasit"},
        {"code": "uk", "chat_id": "freemiumtradeideasuk"},
        {"code": "th", "chat_id": "freemiumtradeideasth"},
        {"code": "pl", "chat_id": "freemiumtradeideaspl"},
        {"code": "fr", "chat_id": "freemiumtradeideasfr"},   
    ]

    for language in languages:
        await send_document(document_id=message.document.file_id, caption=caption,target=language["chat_id"], code = language["code"])
    


app.run()


