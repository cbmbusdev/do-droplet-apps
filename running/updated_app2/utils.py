import re 
import asyncio
import gtranslate

translator = gtranslate.AsyncTranslator()

async def translate(text,lan_code):
    result = await translator.translate(text, to=lan_code)
    return result.text

def contains_live_trade(text):
    pattern = r'Live Trade|Buy Limit|Buy Stop|Sell Limit|Sell Stop'
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return True
    else:
        return False
    



if __name__ == "__main__":
    print(asyncio.run(translate("Market Chart",'pl')))
