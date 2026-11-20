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
    text = None
 
    if message.text:
        eng_text = message.text 

    if message.caption:
        eng_text = message.caption
    



    if utils.contains_live_trade(text):
        link = ""
        for entity in message.entities:
        
            if entity.type == MessageEntityType.TEXT_LINK:
               link = entity.url



# text.replace("Graphique du marché",f"[Graphique du marché]({link})")

        ## Chinese (ZH)

        try:
            zh_text = utils.translate(eng_text, "zh-CN")
            zh_text = zh_text.replace("市场图表", f"[市场图表]({link})")
            await client.send_message(chat_id=-1001603876871, text=zh_text)

        except FloodWait as e:
            await asyncio.sleep(e.value)
            zh_text = utils.translate(eng_text, "zh-CN")
            zh_text = zh_text.replace("市场图表", f"[市场图表]({link})")
            await client.send_message(chat_id=-1001603876871, text=zh_text)

        except:
            pass 


        ## Hindi (HI)
        hi_text = utils.translate(eng_text, "hi")
        hi_text = hi_text.replace("बाज़ार चार्ट", f"[बाज़ार चार्ट]({link})")
        await client.send_message(chat_id=-1001968374987, text=hi_text)

        ## Spanish (ES)
        es_text = utils.translate(eng_text, "es")
        es_text = es_text.replace("Gráfico de mercado", f"[Gráfico de mercado]({link})")
        await client.send_message(chat_id=-1001967102248, text=es_text)

        ## Arabic (AR)
        ar_text = utils.translate(eng_text, "ar")
        ar_text = ar_text.replace("مخطط السوق", f"[مخطط السوق]({link})")
        await client.send_message(chat_id=-1001834832881, text=ar_text)

        ## Portuguese (PT)
        pt_text = utils.translate(eng_text, "pt")
        pt_text = pt_text.replace("Gráfico de mercado", f"[Gráfico de mercado]({link})")
        await client.send_message(chat_id=-1001808225555, text=pt_text)

        ## German (DE)
        de_text = utils.translate(eng_text, "de")
        de_text = de_text.replace("Marktdiagramm", f"[Marktdiagramm]({link})")
        await client.send_message(chat_id=-1001691947406, text=de_text)

        ## Indonesian (ID)
        id_text = utils.translate(eng_text, "id")
        id_text = id_text.replace("Bagan Pasar", f"[Bagan Pasar]({link})")
        await client.send_message(chat_id=-1001680767391, text=id_text)

        ## Russian (RU)
        ru_text = utils.translate(eng_text, "ru")
        ru_text = ru_text.replace("График рынка", f"[График рынка]({link})")
        await client.send_message(chat_id=-1001935574963, text=ru_text)

        ## Persian (FA)
        fa_text = utils.translate(eng_text, "fa")
        fa_text = fa_text.replace("نمودار بازار", f"[نمودار بازار]({link})")
        await client.send_message(chat_id=-1001977282644, text=fa_text)

        ## Bengali (BN)
        bn_text = utils.translate(eng_text, "bn")
        bn_text = bn_text.replace("মার্কেট চার্ট", f"[মার্কেট চার্ট]({link})")
        await client.send_message(chat_id=-1001907958732, text=bn_text)

        ## Japanese (JA)
        ja_text = utils.translate(eng_text, "ja")
        ja_text = ja_text.replace("マーケットチャート", f"[マーケットチャート]({link})")
        await client.send_message(chat_id=-1001981722418, text=ja_text)

        ## Turkish (TR)
        tr_text = utils.translate(eng_text, "tr")
        tr_text = tr_text.replace("Piyasa Grafiği", f"[Piyasa Grafiği]({link})")
        await client.send_message(chat_id=-1001833700983, text=tr_text)

        ## Vietnamese (VI)
        vi_text = utils.translate(eng_text, "vi")
        vi_text = vi_text.replace("Biểu đồ thị trường", f"[Biểu đồ thị trường]({link})")
        await client.send_message(chat_id=-1001933912583, text=vi_text)

        ## Korean (KO)
        ko_text = utils.translate(eng_text, "ko")
        ko_text = ko_text.replace("시장 차트", f"[시장 차트]({link})")
        await client.send_message(chat_id=-1001866826313, text=ko_text)

        ## Italian (IT)
        it_text = utils.translate(eng_text, "it")
        it_text = it_text.replace("Grafico del mercato", f"[Grafico del mercato]({link})")
        await client.send_message(chat_id=-1001868063964, text=it_text)

        ## Ukrainian (UK)
        uk_text = utils.translate(eng_text, "uk")
        uk_text = uk_text.replace("Діаграма ринку", f"[Діаграма ринку]({link})")
        await client.send_message(chat_id=-1001919151335, text=uk_text)

        ## Thai (TH)
        th_text = utils.translate(eng_text, "th")
        th_text = th_text.replace("แผนภูมิตลาด", f"[แผนภูมิตลาด]({link})")
        await client.send_message(chat_id=-1001878897497, text=th_text)

        ## Polish (PL)
        pl_text = utils.translate(eng_text, "pl")
        pl_text = pl_text.replace("Wykres rynku", f"[Wykres rynku]({link})")
        await client.send_message(chat_id=-1001649301490, text=pl_text)





app.run()


