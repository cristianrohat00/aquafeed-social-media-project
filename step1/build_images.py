"""Renders all step-1 post images. Run from repo root: python step1/build_images.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import render as r

B = 'step1/brand/'   # Aquafeed's own photos (aquafeed-biomar.ro)
S = 'step1/src/'     # supplier post images
O = 'step1/out/'
os.makedirs(O, exist_ok=True)

# P1 farmer tip - fish immunity
r.card('Sfatul fermierului', 'Două „linii de apărare”. Amândouă depind de furaj.',
       ['Înnăscută: reacționează imediat. Pielea, mucusul și branhiile sunt prima barieră.',
        'Adaptivă: „ține minte” agentul patogen și răspunde mai repede data viitoare.'],
       O + 'p1_imunitate.jpg', numbered=True,
       note='Ambele au nevoie de energie și nutrienți. Peștele subnutrit sau stresat se apără mai greu.', header_photo=B + 'home-page.jpg', header_h=520,
       header_crop=(0.12, 0.05, 0.88, 0.95))

# P2 consumers - why eat trout
r.overlay('step1/stock/c31.jpg', 'Românii mănâncă de 2,6 ori mai puțin pește decât media europeană',  # Wikimedia Commons, CC0
          '8,75 kg/an în România vs. 22,9 kg/an în UE (EUMOFA, 2023). Păstrăvul românesc e o soluție la îndemână.',
          O + 'p2_de_ce_pastrav.jpg', tag='De ce păstrăv?')

# P3 consumers - myth vs fact
r.split(B + 'apa_curata_pesti.jpg', 'Mit sau fapt?', 'MIT: „Peștele de crescătorie e plin de hormoni.”',
        'FAPT: În UE, hormonii de creștere sunt interziși în creșterea animalelor, inclusiv a peștilor. Păstrăvul primește un furaj complet: proteine, uleiuri, vitamine și minerale.',
        O + 'p3_mit_fapt.jpg', photo_h=720)

# P4 farmers - FCR / real feed cost
r.card('Calcul pentru fermieri', 'Furajul ieftin poate ieși cel mai scump',
       ['Furaj A: 10 lei/kg × FCR 1,0 = 10,00 lei/kg pește',
        'Furaj B: 8,50 lei/kg × FCR 1,3 = 11,05 lei/kg pește',
        'Furajul „ieftin” costă cu 10% mai mult pe kg vândut.'],
       O + 'p4_fcr.jpg', header_photo=B + 'products_image.jpg', header_h=540,
       source='Cifre ilustrative. FCR = kg furaj / kg creștere.')

# P5 farmers - Hands On Farming + poll
r.split(S + 'handson_0.jpg', 'Întrebarea săptămânii', 'Care e cea mai mare provocare în ferma voastră?',
        'A) Apa: temperatură, debit, oxigen\nB) Bolile și sănătatea peștilor\nC) Prețul furajului și costurile\nD) Vânzarea peștelui\n\nRăspundeți cu litera în comentarii.',
        O + 'p5_provocari.jpg', crop=(0, 0, 1, 0.80), photo_h=620, credit='Foto: BioMar · Hands On Farming', sharpen=True)

# P6 farmers + consumers - factory efficiency + climate plan
r.card('Din culisele BioMar', 'Furaj produs cu mai puțină energie și mai puține emisii',
       ['−22% emisii din fabricile și operațiunile proprii (2025)',
        '−31% emisii vizate din lanțul de aprovizionare',
        'Plan climatic verificat independent'],
       O + 'p6_fabrica_clima.jpg', header_photo=B + 'productie_furaj.jpg', header_h=520,
       source='Sursa: BioMar, Climate Transition Plan și Manufacturing Impact Challenge (nov. 2026)')
print('ok')
