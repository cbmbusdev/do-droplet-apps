import re 
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