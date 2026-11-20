import logging

import pytz
from pyrogram import Client,filters 
from pyrogram.types import Message
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import config


logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

app = Client(name='app',api_id=config.API_ID,api_hash=config.API_HASH,phone_number=config.PHONE_NUMBER)

scheduler = AsyncIOScheduler(timezone = pytz.timezone('Etc/GMT+1'))

LIMIT = { 
    'en': 0,
    'fr': 0,
    'cn': 0,
    'hi': 0,
    'es': 0,
    'ar': 0,
    'pt': 0,
    'de': 0,
    'id': 0,
    'ru': 0,
    'fa': 0,
    'bn': 0,
    'ja': 0,
    'tr': 0,
    'ko': 0,
    'it': 0,
    'uk': 0,
    'th': 0,
    'pl': 0,
    'vi': 0
}



@app.on_message(filters.text & filters.chat(-1001716677263))
async def english_handler(client:Client,message:Message):
    if LIMIT['en'] == 0:
        await message.forward(chat_id="@freemiumtradeideas")
        LIMIT['en'] = 1


@app.on_message(filters.text & filters.chat(-1001727546393))
async def fr_handler(client:Client,message:Message):
    if LIMIT['fr'] ==0:
        await message.forward("@freemiumtradeideasfr")
        LIMIT['fr'] = 1

@app.on_message(filters.text & filters.chat(-1001603876871))
async def cn_handler(client, message:Message):
    if LIMIT['cn'] == 0:
        await message.forward("@freemiumtradeideaszh")
        LIMIT['cn'] = 1

@app.on_message(filters.text & filters.chat(-1001968374987) )
async def hi_handler(client,message:Message):
    if LIMIT['hi'] == 0:
        await message.forward(chat_id="@freemiumtradeideashi")
        LIMIT['hi'] =1 

@app.on_message(filters.text & filters.chat(-1001967102248))
async def es_handler(client,message:Message):
    if LIMIT['es'] == 0:
        await message.forward(chat_id="@freemiumtradeideases")
        LIMIT['es'] = 1


@app.on_message(filters.text & filters.chat(-1001834832881))
async def ar_handler(client,message:Message):
    if LIMIT['ar'] == 0:
        await message.forward(chat_id="@freemiumtradeideasar")
        LIMIT['ar'] = 1


@app.on_message(filters.text & filters.chat(-1001808225555))
async def pt_handler(client,message:Message):
    if LIMIT['pt'] ==0:
        await message.forward(chat_id="@freemiumtradeideaspt")
        LIMIT['pt'] = 1



@app.on_message(filters.text & filters.chat(-1001691947406))
async def de_handler(client,message:Message):
    if LIMIT['de'] == 0:
        await message.forward(chat_id="@freemiumtradeideasde")
        LIMIT['de'] = 1

@app.on_message(filters.text & filters.chat(-1001680767391))
async def id_handler(client,message:Message):
    if LIMIT['id'] == 0:
        await message.forward(chat_id="@freemiumtradeideasid")
        LIMIT['id'] = 1


@app.on_message(filters.text & filters.chat(-1001935574963))
async def ru_handler(client,message:Message):
    if LIMIT['ru'] == 0:
        await message.forward(chat_id="@freemiumtradeideasru")
        LIMIT['ru']=1


@app.on_message(filters.text & filters.chat(-1001977282644))
async def fa_handler(client,message:Message):
    if LIMIT['fa'] == 0:
        await message.forward(chat_id="@freemiumtradeideasfa")
        LIMIT['fa'] = 1


@app.on_message(filters.text & filters.chat(-1001907958732))
async def bn_handler(client,message:Message):
    if LIMIT['bn'] == 0:
        await message.forward(chat_id="@freemiumtradeideasbn")
        LIMIT['bn']=1


@app.on_message(filters.text & filters.chat(-1001981722418))
async def ja_handler(client,message:Message):
    if LIMIT['ja']== 0:
        await message.forward(chat_id="@freemiumtradeideasja")
        LIMIT['ja'] = 1

@app.on_message(filters.text & filters.chat(-1001833700983))
async def tr_handler(client,message:Message):
    if LIMIT['tr'] == 0:
        await message.forward(chat_id="@freemiumtradeideastr")
        LIMIT['tr'] = 1

@app.on_message(filters.text & filters.chat(-1001933912583))
async def vi_handler(client,message:Message):
    if LIMIT['vi'] == 0:
        await message.forward(chat_id="@freemiumtradeideasvi")
        LIMIT['vi'] = 1


@app.on_message(filters.text & filters.chat(-1001866826313))
async def ko_handler(client,message:Message):
    if LIMIT['ko'] == 0:
        await message.forward(chat_id = "@freemiumtradeideasko")
        LIMIT['ko'] = 1


@app.on_message(filters.text & filters.chat(-1001868063964 ))
async def it_handler(client,message:Message):
    if LIMIT['it'] == 0:
        await message.forward(chat_id="@freemiumtradeideasit")
        LIMIT['it'] = 1 


@app.on_message(filters.text & filters.chat(-1001919151335))
async def uk_handler(client,message:Message):
    if LIMIT['uk'] == 0:
        await message.forward(chat_id="@freemiumtradeideasuk")
        LIMIT['uk'] = 1


@app.on_message(filters.text & filters.chat(-1001878897497))
async def th_handler(client,message:Message):
    if LIMIT['th'] == 0:
        await message.forward(chat_id="@freemiumtradeideasth")
        LIMIT['th'] = 1

@app.on_message(filters.text & filters.chat(-1001649301490))
async def pl_handler(client,message:Message):
    if LIMIT['pl'] == 0:
        await message.forward(chat_id= "@freemiumtradeideaspl")
        LIMIT['pl'] = 1 


async def reset_global_config():
    global LIMIT
    LIMIT = { 
    'en': 0,
    'fr': 0,
    'cn': 0,
    'hi': 0,
    'es': 0,
    'ar': 0,
    'pt': 0,
    'de': 0,
    'id': 0,
    'ru': 0,
    'fa': 0,
    'bn': 0,
    'ja': 0,
    'tr': 0,
    'ko': 0,
    'it': 0,
    'uk': 0,
    'th': 0,
    'pl': 0,
    'vi': 0
}



scheduler.add_job(reset_global_config,'cron',hour=0)
scheduler.start()
app.run()
