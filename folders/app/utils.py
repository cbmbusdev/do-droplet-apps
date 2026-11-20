import re 
from googletrans import Translator

def translate(text,lan_code):
    translator = Translator()
    tr = translator.translate(text, dest=lan_code).text
    return tr

def contains_live_trade(text):
    pattern = r'Live Trade'
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return True
    else:
        return False