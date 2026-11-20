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
        {"code": "zh-CN", "chat_id": -1001603876871},
        {"code": "hi", "chat_id": -1001968374987},
        {"code": "es", "chat_id": -1001967102248},
        {"code": "ar", "chat_id": -1001834832881},
        {"code": "pt", "chat_id": -1001808225555},
        {"code": "de", "chat_id": -1001691947406},
        {"code": "id", "chat_id": -1001680767391},
        {"code": "ru", "chat_id": -1001935574963},
        {"code": "fa", "chat_id": -1001977282644},
        {"code": "bn", "chat_id": -1001907958732},
        {"code": "ja", "chat_id": -1001981722418},
        {"code": "tr", "chat_id": -1001833700983},
        {"code": "vi", "chat_id": -1001933912583},
        {"code": "ko", "chat_id": -1001866826313},
        {"code": "it", "chat_id": -1001868063964},
        {"code": "uk", "chat_id": -1001919151335},
        {"code": "th", "chat_id": -1001878897497},
        {"code": "pl", "chat_id": -1001649301490},
        {"code": "fr", "chat_id": -1001727546393},   

    ]

    for language in languages:
        await send_photo(photo_id=message.photo.file_id, caption=caption,target=language["chat_id"], code = language["code"])
    


@app.on_message(filters.chat(Credentials.SOURCE) & filters.video)
async def photo_forward(client:Client,message:Message):
    caption = message.caption
    if not caption:
        caption = ""

    languages = [
        {"code": "zh-CN", "chat_id": -1001603876871},
        {"code": "hi", "chat_id": -1001968374987},
        {"code": "es", "chat_id": -1001967102248},
        {"code": "ar", "chat_id": -1001834832881},
        {"code": "pt", "chat_id": -1001808225555},
        {"code": "de", "chat_id": -1001691947406},
        {"code": "id", "chat_id": -1001680767391},
        {"code": "ru", "chat_id": -1001935574963},
        {"code": "fa", "chat_id": -1001977282644},
        {"code": "bn", "chat_id": -1001907958732},
        {"code": "ja", "chat_id": -1001981722418},
        {"code": "tr", "chat_id": -1001833700983},
        {"code": "vi", "chat_id": -1001933912583},
        {"code": "ko", "chat_id": -1001866826313},
        {"code": "it", "chat_id": -1001868063964},
        {"code": "uk", "chat_id": -1001919151335},
        {"code": "th", "chat_id": -1001878897497},
        {"code": "pl", "chat_id": -1001649301490},
        {"code": "fr", "chat_id": -1001727546393},   

    ]

    for language in languages:
        await send_video(video_id=message.video.file_id, caption=caption,target=language["chat_id"], code = language["code"])
    


@app.on_message(filters.chat(Credentials.SOURCE) & filters.document)
async def photo_forward(client:Client,message:Message):
    caption = message.caption
    if not caption:
        caption = ""

    languages = [
        {"code": "zh-CN", "chat_id": -1001603876871},
        {"code": "hi", "chat_id": -1001968374987},
        {"code": "es", "chat_id": -1001967102248},
        {"code": "ar", "chat_id": -1001834832881},
        {"code": "pt", "chat_id": -1001808225555},
        {"code": "de", "chat_id": -1001691947406},
        {"code": "id", "chat_id": -1001680767391},
        {"code": "ru", "chat_id": -1001935574963},
        {"code": "fa", "chat_id": -1001977282644},
        {"code": "bn", "chat_id": -1001907958732},
        {"code": "ja", "chat_id": -1001981722418},
        {"code": "tr", "chat_id": -1001833700983},
        {"code": "vi", "chat_id": -1001933912583},
        {"code": "ko", "chat_id": -1001866826313},
        {"code": "it", "chat_id": -1001868063964},
        {"code": "uk", "chat_id": -1001919151335},
        {"code": "th", "chat_id": -1001878897497},
        {"code": "pl", "chat_id": -1001649301490},
        {"code": "fr", "chat_id": -1001727546393},   

    ]

    for language in languages:
        await send_document(document_id=message.document.file_id, caption=caption,target=language["chat_id"], code = language["code"])
    


app.run()


