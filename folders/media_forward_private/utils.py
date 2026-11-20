import re 
from googletrans import Translator

def translate(text,lan_code):
    translator = Translator()
    tr = translator.translate(text, dest=lan_code).text
    return tr


