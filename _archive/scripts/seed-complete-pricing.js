require('dotenv').config()
const mongoose = require('mongoose')
const ServiceItem = require('./src/models/ServiceItem')

// Realistic Indian laundry market prices (in INR)
const completeItems = [
  // ============ MEN'S CLOTHING ============
  // Shirts
  { name: "Men's Shirt (Cotton)", category: 'men', wash_fold: 25, wash_iron: 40, dry_clean: 80, steam_press: 20, starching: 30, alteration: 100 },
  { name: "Men's Shirt (Linen)", category: 'men', wash_fold: 35, wash_iron: 50, dry_clean: 100, steam_press: 25, starching: 40, alteration: 120 },
  { name: "Men's Shirt (Silk)", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 40, starching: 0, alteration: 150 },
  { name: "Formal Shirt", category: 'men', wash_fold: 30, wash_iron: 45, dry_clean: 90, steam_press: 25, starching: 35, alteration: 120 },
  
  // T-Shirts
  { name: "T-Shirt (Regular)", category: 'men', wash_fold: 20, wash_iron: 30, dry_clean: 60, steam_press: 15, starching: 0, alteration: 80 },
  { name: "T-Shirt (Premium)", category: 'men', wash_fold: 30, wash_iron: 40, dry_clean: 80, steam_press: 20, starching: 0, alteration: 100 },
  { name: "Polo T-Shirt", category: 'men', wash_fold: 25, wash_iron: 35, dry_clean: 70, steam_press: 18, starching: 0, alteration: 90 },
  
  // Trousers & Pants
  { name: "Trousers (Cotton)", category: 'men', wash_fold: 30, wash_iron: 45, dry_clean: 90, steam_press: 25, starching: 35, alteration: 150 },
  { name: "Trousers (Formal)", category: 'men', wash_fold: 35, wash_iron: 50, dry_clean: 100, steam_press: 30, starching: 40, alteration: 180 },
  { name: "Jeans", category: 'men', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 30, starching: 0, alteration: 200 },
  { name: "Shorts", category: 'men', wash_fold: 20, wash_iron: 30, dry_clean: 50, steam_press: 15, starching: 0, alteration: 80 },
  { name: "Track Pants", category: 'men', wash_fold: 25, wash_iron: 35, dry_clean: 60, steam_press: 18, starching: 0, alteration: 100 },
  
  // Suits & Formal
  { name: "Suit (2-Piece)", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 350, steam_press: 80, starching: 0, alteration: 500 },
  { name: "Suit (3-Piece)", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 450, steam_press: 100, starching: 0, alteration: 650 },
  { name: "Blazer", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 250, steam_press: 60, starching: 0, alteration: 350 },
  { name: "Waistcoat", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 40, starching: 0, alteration: 200 },
  { name: "Tuxedo", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 500, steam_press: 120, starching: 0, alteration: 700 },
  
  // Traditional
  { name: "Kurta (Cotton)", category: 'men', wash_fold: 30, wash_iron: 45, dry_clean: 80, steam_press: 25, starching: 35, alteration: 120 },
  { name: "Kurta (Silk)", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 45, starching: 0, alteration: 180 },
  { name: "Kurta Pajama Set", category: 'men', wash_fold: 50, wash_iron: 70, dry_clean: 150, steam_press: 45, starching: 50, alteration: 200 },
  { name: "Sherwani", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 600, steam_press: 150, starching: 0, alteration: 800 },
  { name: "Dhoti", category: 'men', wash_fold: 25, wash_iron: 40, dry_clean: 60, steam_press: 20, starching: 40, alteration: 80 },
  { name: "Nehru Jacket", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 200, steam_press: 50, starching: 0, alteration: 250 },
  
  // Outerwear
  { name: "Jacket (Light)", category: 'men', wash_fold: 50, wash_iron: 70, dry_clean: 180, steam_press: 50, starching: 0, alteration: 250 },
  { name: "Jacket (Heavy/Winter)", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 300, steam_press: 80, starching: 0, alteration: 400 },
  { name: "Coat/Overcoat", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 400, steam_press: 100, starching: 0, alteration: 500 },
  { name: "Sweater (Woolen)", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 40, starching: 0, alteration: 180 },
  { name: "Cardigan", category: 'men', wash_fold: 40, wash_iron: 55, dry_clean: 120, steam_press: 35, starching: 0, alteration: 150 },
  { name: "Hoodie", category: 'men', wash_fold: 45, wash_iron: 60, dry_clean: 100, steam_press: 30, starching: 0, alteration: 150 },
  
  // Innerwear & Others
  { name: "Vest/Undershirt", category: 'men', wash_fold: 15, wash_iron: 20, dry_clean: 40, steam_press: 10, starching: 0, alteration: 50 },
  { name: "Tie", category: 'men', wash_fold: 0, wash_iron: 0, dry_clean: 80, steam_press: 30, starching: 0, alteration: 0 },
  { name: "Scarf (Men)", category: 'men', wash_fold: 30, wash_iron: 40, dry_clean: 80, steam_press: 25, starching: 0, alteration: 0 },

  // ============ WOMEN'S CLOTHING ============
  // Tops & Blouses
  { name: "Women's Shirt/Top", category: 'women', wash_fold: 25, wash_iron: 40, dry_clean: 80, steam_press: 20, starching: 25, alteration: 100 },
  { name: "Blouse (Cotton)", category: 'women', wash_fold: 25, wash_iron: 35, dry_clean: 70, steam_press: 20, starching: 25, alteration: 120 },
  { name: "Blouse (Silk)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 120, steam_press: 35, starching: 0, alteration: 150 },
  { name: "Blouse (Designer)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 200, steam_press: 50, starching: 0, alteration: 250 },
  { name: "T-Shirt (Women)", category: 'women', wash_fold: 20, wash_iron: 30, dry_clean: 60, steam_press: 15, starching: 0, alteration: 80 },
  
  // Kurtis & Tunics
  { name: "Kurti (Cotton)", category: 'women', wash_fold: 30, wash_iron: 45, dry_clean: 80, steam_press: 25, starching: 30, alteration: 120 },
  { name: "Kurti (Silk/Georgette)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 40, starching: 0, alteration: 180 },
  { name: "Kurti (Designer)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 200, steam_press: 50, starching: 0, alteration: 250 },
  { name: "Anarkali Kurti", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 180, steam_press: 50, starching: 0, alteration: 220 },
  
  // Sarees
  { name: "Saree (Cotton)", category: 'women', wash_fold: 40, wash_iron: 60, dry_clean: 100, steam_press: 40, starching: 50, alteration: 150 },
  { name: "Saree (Silk)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 200, steam_press: 60, starching: 0, alteration: 250 },
  { name: "Saree (Georgette/Chiffon)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 50, starching: 0, alteration: 200 },
  { name: "Saree (Banarasi)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 350, steam_press: 80, starching: 0, alteration: 400 },
  { name: "Saree (Designer/Heavy)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 400, steam_press: 100, starching: 0, alteration: 500 },
  { name: "Saree (Kanjeevaram)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 450, steam_press: 100, starching: 0, alteration: 500 },
  
  // Suits & Sets
  { name: "Salwar Suit (Cotton)", category: 'women', wash_fold: 60, wash_iron: 80, dry_clean: 150, steam_press: 50, starching: 60, alteration: 200 },
  { name: "Salwar Suit (Silk)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 250, steam_press: 70, starching: 0, alteration: 300 },
  { name: "Salwar Suit (Designer)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 350, steam_press: 90, starching: 0, alteration: 400 },
  { name: "Churidar Set", category: 'women', wash_fold: 50, wash_iron: 70, dry_clean: 140, steam_press: 45, starching: 50, alteration: 180 },
  { name: "Palazzo Set", category: 'women', wash_fold: 50, wash_iron: 70, dry_clean: 140, steam_press: 45, starching: 0, alteration: 180 },
  
  // Lehengas & Bridal
  { name: "Lehenga (Simple)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 400, steam_press: 100, starching: 0, alteration: 500 },
  { name: "Lehenga (Heavy/Bridal)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 800, steam_press: 200, starching: 0, alteration: 1000 },
  { name: "Bridal Lehenga", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 1200, steam_press: 300, starching: 0, alteration: 1500 },
  { name: "Ghagra Choli", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 350, steam_press: 90, starching: 0, alteration: 450 },
  
  // Dresses & Gowns
  { name: "Dress (Casual)", category: 'women', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 35, starching: 0, alteration: 150 },
  { name: "Dress (Formal)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 45, starching: 0, alteration: 200 },
  { name: "Maxi Dress", category: 'women', wash_fold: 50, wash_iron: 70, dry_clean: 150, steam_press: 45, starching: 0, alteration: 200 },
  { name: "Evening Gown", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 400, steam_press: 100, starching: 0, alteration: 500 },
  { name: "Party Gown", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 350, steam_press: 90, starching: 0, alteration: 450 },
  { name: "Wedding Gown", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 1500, steam_press: 350, starching: 0, alteration: 2000 },
  
  // Bottoms
  { name: "Skirt (Regular)", category: 'women', wash_fold: 30, wash_iron: 45, dry_clean: 80, steam_press: 25, starching: 0, alteration: 120 },
  { name: "Skirt (Long/Maxi)", category: 'women', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 35, starching: 0, alteration: 150 },
  { name: "Jeans (Women)", category: 'women', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 30, starching: 0, alteration: 200 },
  { name: "Trousers (Women)", category: 'women', wash_fold: 30, wash_iron: 45, dry_clean: 90, steam_press: 25, starching: 30, alteration: 150 },
  { name: "Leggings", category: 'women', wash_fold: 20, wash_iron: 30, dry_clean: 50, steam_press: 15, starching: 0, alteration: 80 },
  { name: "Palazzo Pants", category: 'women', wash_fold: 30, wash_iron: 45, dry_clean: 80, steam_press: 25, starching: 0, alteration: 120 },
  
  // Others
  { name: "Dupatta (Cotton)", category: 'women', wash_fold: 20, wash_iron: 30, dry_clean: 50, steam_press: 20, starching: 25, alteration: 60 },
  { name: "Dupatta (Silk/Chiffon)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 100, steam_press: 35, starching: 0, alteration: 100 },
  { name: "Stole/Shawl", category: 'women', wash_fold: 40, wash_iron: 55, dry_clean: 120, steam_press: 35, starching: 0, alteration: 100 },
  { name: "Cardigan (Women)", category: 'women', wash_fold: 40, wash_iron: 55, dry_clean: 120, steam_press: 35, starching: 0, alteration: 150 },
  { name: "Sweater (Women)", category: 'women', wash_fold: 0, wash_iron: 0, dry_clean: 150, steam_press: 40, starching: 0, alteration: 180 },
  { name: "Jacket (Women)", category: 'women', wash_fold: 50, wash_iron: 70, dry_clean: 180, steam_press: 50, starching: 0, alteration: 250 },

  // ============ KIDS CLOTHING ============
  { name: "Kids T-Shirt", category: 'kids', wash_fold: 15, wash_iron: 22, dry_clean: 45, steam_press: 12, starching: 0, alteration: 60 },
  { name: "Kids Shirt", category: 'kids', wash_fold: 18, wash_iron: 28, dry_clean: 55, steam_press: 15, starching: 20, alteration: 70 },
  { name: "Kids Trousers/Pants", category: 'kids', wash_fold: 20, wash_iron: 30, dry_clean: 60, steam_press: 18, starching: 0, alteration: 100 },
  { name: "Kids Jeans", category: 'kids', wash_fold: 25, wash_iron: 35, dry_clean: 70, steam_press: 20, starching: 0, alteration: 120 },
  { name: "Kids Shorts", category: 'kids', wash_fold: 12, wash_iron: 18, dry_clean: 35, steam_press: 10, starching: 0, alteration: 50 },
  { name: "Kids Dress", category: 'kids', wash_fold: 25, wash_iron: 38, dry_clean: 80, steam_press: 25, starching: 0, alteration: 100 },
  { name: "Kids Frock", category: 'kids', wash_fold: 25, wash_iron: 38, dry_clean: 80, steam_press: 25, starching: 0, alteration: 100 },
  { name: "Kids Kurta", category: 'kids', wash_fold: 22, wash_iron: 32, dry_clean: 60, steam_press: 18, starching: 25, alteration: 80 },
  { name: "Kids Lehenga", category: 'kids', wash_fold: 0, wash_iron: 0, dry_clean: 200, steam_press: 50, starching: 0, alteration: 250 },
  { name: "Kids Sherwani", category: 'kids', wash_fold: 0, wash_iron: 0, dry_clean: 300, steam_press: 80, starching: 0, alteration: 350 },
  { name: "School Uniform (Shirt)", category: 'kids', wash_fold: 18, wash_iron: 28, dry_clean: 50, steam_press: 15, starching: 22, alteration: 70 },
  { name: "School Uniform (Pants)", category: 'kids', wash_fold: 20, wash_iron: 30, dry_clean: 55, steam_press: 18, starching: 0, alteration: 90 },
  { name: "School Uniform (Skirt)", category: 'kids', wash_fold: 18, wash_iron: 28, dry_clean: 50, steam_press: 15, starching: 0, alteration: 80 },
  { name: "Kids Jacket", category: 'kids', wash_fold: 35, wash_iron: 50, dry_clean: 120, steam_press: 35, starching: 0, alteration: 150 },
  { name: "Kids Sweater", category: 'kids', wash_fold: 0, wash_iron: 0, dry_clean: 100, steam_press: 30, starching: 0, alteration: 120 },
  { name: "Baby Clothes (per piece)", category: 'kids', wash_fold: 12, wash_iron: 18, dry_clean: 35, steam_press: 10, starching: 0, alteration: 40 },

  // ============ HOUSEHOLD ITEMS ============
  // Bedding
  { name: "Bed Sheet (Single)", category: 'household', wash_fold: 40, wash_iron: 60, dry_clean: 100, steam_press: 35, starching: 50, alteration: 80 },
  { name: "Bed Sheet (Double)", category: 'household', wash_fold: 60, wash_iron: 85, dry_clean: 150, steam_press: 50, starching: 70, alteration: 120 },
  { name: "Bed Sheet (King Size)", category: 'household', wash_fold: 80, wash_iron: 110, dry_clean: 180, steam_press: 60, starching: 90, alteration: 150 },
  { name: "Pillow Cover", category: 'household', wash_fold: 15, wash_iron: 22, dry_clean: 40, steam_press: 12, starching: 18, alteration: 40 },
  { name: "Cushion Cover", category: 'household', wash_fold: 20, wash_iron: 30, dry_clean: 50, steam_press: 15, starching: 22, alteration: 50 },
  { name: "Mattress Cover", category: 'household', wash_fold: 80, wash_iron: 100, dry_clean: 200, steam_press: 60, starching: 0, alteration: 150 },
  { name: "Duvet Cover (Single)", category: 'household', wash_fold: 80, wash_iron: 100, dry_clean: 180, steam_press: 55, starching: 0, alteration: 150 },
  { name: "Duvet Cover (Double)", category: 'household', wash_fold: 100, wash_iron: 130, dry_clean: 220, steam_press: 70, starching: 0, alteration: 180 },
  
  // Blankets & Quilts
  { name: "Blanket (Single)", category: 'household', wash_fold: 100, wash_iron: 0, dry_clean: 200, steam_press: 0, starching: 0, alteration: 150 },
  { name: "Blanket (Double)", category: 'household', wash_fold: 150, wash_iron: 0, dry_clean: 300, steam_press: 0, starching: 0, alteration: 200 },
  { name: "Comforter (Single)", category: 'household', wash_fold: 150, wash_iron: 0, dry_clean: 300, steam_press: 0, starching: 0, alteration: 200 },
  { name: "Comforter (Double)", category: 'household', wash_fold: 200, wash_iron: 0, dry_clean: 400, steam_press: 0, starching: 0, alteration: 250 },
  { name: "Quilt/Razai", category: 'household', wash_fold: 180, wash_iron: 0, dry_clean: 350, steam_press: 0, starching: 0, alteration: 200 },
  
  // Curtains
  { name: "Curtain (Small/Window)", category: 'household', wash_fold: 60, wash_iron: 80, dry_clean: 150, steam_press: 50, starching: 60, alteration: 100 },
  { name: "Curtain (Large/Door)", category: 'household', wash_fold: 100, wash_iron: 130, dry_clean: 250, steam_press: 80, starching: 100, alteration: 150 },
  { name: "Curtain (Heavy/Velvet)", category: 'household', wash_fold: 0, wash_iron: 0, dry_clean: 400, steam_press: 120, starching: 0, alteration: 250 },
  { name: "Sheer Curtain", category: 'household', wash_fold: 50, wash_iron: 70, dry_clean: 120, steam_press: 40, starching: 50, alteration: 80 },
  
  // Towels & Bath
  { name: "Towel (Hand)", category: 'household', wash_fold: 15, wash_iron: 0, dry_clean: 30, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Towel (Bath)", category: 'household', wash_fold: 25, wash_iron: 0, dry_clean: 50, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Towel (Large/Beach)", category: 'household', wash_fold: 35, wash_iron: 0, dry_clean: 70, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Bath Mat", category: 'household', wash_fold: 30, wash_iron: 0, dry_clean: 60, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Bathrobe", category: 'household', wash_fold: 60, wash_iron: 80, dry_clean: 150, steam_press: 45, starching: 0, alteration: 120 },
  
  // Table & Kitchen
  { name: "Table Cloth (Small)", category: 'household', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 35, starching: 45, alteration: 80 },
  { name: "Table Cloth (Large)", category: 'household', wash_fold: 60, wash_iron: 80, dry_clean: 150, steam_press: 50, starching: 65, alteration: 120 },
  { name: "Table Runner", category: 'household', wash_fold: 25, wash_iron: 35, dry_clean: 60, steam_press: 20, starching: 30, alteration: 50 },
  { name: "Napkin (Cloth)", category: 'household', wash_fold: 10, wash_iron: 15, dry_clean: 25, steam_press: 8, starching: 12, alteration: 20 },
  { name: "Kitchen Towel", category: 'household', wash_fold: 12, wash_iron: 0, dry_clean: 25, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Apron", category: 'household', wash_fold: 20, wash_iron: 30, dry_clean: 50, steam_press: 15, starching: 22, alteration: 60 },
  
  // Sofa & Upholstery
  { name: "Sofa Cover (Single Seat)", category: 'household', wash_fold: 80, wash_iron: 100, dry_clean: 200, steam_press: 60, starching: 0, alteration: 150 },
  { name: "Sofa Cover (3 Seater)", category: 'household', wash_fold: 150, wash_iron: 180, dry_clean: 350, steam_press: 100, starching: 0, alteration: 250 },
  { name: "Chair Cover", category: 'household', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 35, starching: 0, alteration: 80 },

  // ============ INSTITUTIONAL ============
  { name: "Hotel Bed Sheet (Single)", category: 'institutional', wash_fold: 35, wash_iron: 50, dry_clean: 90, steam_press: 30, starching: 45, alteration: 70 },
  { name: "Hotel Bed Sheet (Double)", category: 'institutional', wash_fold: 50, wash_iron: 70, dry_clean: 130, steam_press: 45, starching: 60, alteration: 100 },
  { name: "Hotel Pillow Cover", category: 'institutional', wash_fold: 12, wash_iron: 18, dry_clean: 35, steam_press: 10, starching: 15, alteration: 35 },
  { name: "Hotel Towel (Hand)", category: 'institutional', wash_fold: 12, wash_iron: 0, dry_clean: 25, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Hotel Towel (Bath)", category: 'institutional', wash_fold: 20, wash_iron: 0, dry_clean: 40, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Hotel Bathrobe", category: 'institutional', wash_fold: 50, wash_iron: 70, dry_clean: 130, steam_press: 40, starching: 0, alteration: 100 },
  { name: "Restaurant Napkin", category: 'institutional', wash_fold: 8, wash_iron: 12, dry_clean: 20, steam_press: 6, starching: 10, alteration: 15 },
  { name: "Restaurant Table Cloth", category: 'institutional', wash_fold: 35, wash_iron: 50, dry_clean: 90, steam_press: 30, starching: 40, alteration: 70 },
  { name: "Chef Coat", category: 'institutional', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 30, starching: 40, alteration: 120 },
  { name: "Chef Apron", category: 'institutional', wash_fold: 25, wash_iron: 35, dry_clean: 60, steam_press: 18, starching: 28, alteration: 70 },
  { name: "Waiter Uniform (Shirt)", category: 'institutional', wash_fold: 25, wash_iron: 38, dry_clean: 70, steam_press: 20, starching: 30, alteration: 90 },
  { name: "Waiter Uniform (Pants)", category: 'institutional', wash_fold: 28, wash_iron: 42, dry_clean: 80, steam_press: 22, starching: 0, alteration: 120 },
  { name: "Hospital Bed Sheet", category: 'institutional', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 35, starching: 50, alteration: 80 },
  { name: "Hospital Gown", category: 'institutional', wash_fold: 30, wash_iron: 45, dry_clean: 80, steam_press: 25, starching: 0, alteration: 100 },
  { name: "Lab Coat", category: 'institutional', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 30, starching: 40, alteration: 120 },
  { name: "Scrubs (Top)", category: 'institutional', wash_fold: 25, wash_iron: 38, dry_clean: 70, steam_press: 20, starching: 0, alteration: 80 },
  { name: "Scrubs (Bottom)", category: 'institutional', wash_fold: 25, wash_iron: 38, dry_clean: 70, steam_press: 20, starching: 0, alteration: 100 },
  { name: "Salon Cape", category: 'institutional', wash_fold: 30, wash_iron: 45, dry_clean: 80, steam_press: 25, starching: 0, alteration: 60 },
  { name: "Gym Towel", category: 'institutional', wash_fold: 15, wash_iron: 0, dry_clean: 30, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Spa Robe", category: 'institutional', wash_fold: 50, wash_iron: 70, dry_clean: 130, steam_press: 40, starching: 0, alteration: 100 },

  // ============ OTHERS ============
  { name: "Soft Toy (Small)", category: 'others', wash_fold: 50, wash_iron: 0, dry_clean: 100, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Soft Toy (Large)", category: 'others', wash_fold: 100, wash_iron: 0, dry_clean: 200, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Bag (Fabric/Canvas)", category: 'others', wash_fold: 50, wash_iron: 0, dry_clean: 120, steam_press: 0, starching: 0, alteration: 100 },
  { name: "Backpack", category: 'others', wash_fold: 80, wash_iron: 0, dry_clean: 180, steam_press: 0, starching: 0, alteration: 150 },
  { name: "Handbag (Fabric)", category: 'others', wash_fold: 60, wash_iron: 0, dry_clean: 150, steam_press: 0, starching: 0, alteration: 120 },
  { name: "Cap/Hat", category: 'others', wash_fold: 25, wash_iron: 0, dry_clean: 60, steam_press: 20, starching: 0, alteration: 50 },
  { name: "Gloves (Fabric)", category: 'others', wash_fold: 20, wash_iron: 0, dry_clean: 50, steam_press: 0, starching: 0, alteration: 40 },
  { name: "Socks (per pair)", category: 'others', wash_fold: 10, wash_iron: 0, dry_clean: 20, steam_press: 0, starching: 0, alteration: 0 },
  { name: "Belt (Fabric)", category: 'others', wash_fold: 20, wash_iron: 0, dry_clean: 50, steam_press: 0, starching: 0, alteration: 40 },
  { name: "Handkerchief", category: 'others', wash_fold: 8, wash_iron: 12, dry_clean: 20, steam_press: 6, starching: 10, alteration: 0 },
  { name: "Prayer Mat", category: 'others', wash_fold: 40, wash_iron: 55, dry_clean: 100, steam_press: 35, starching: 0, alteration: 60 },
  { name: "Yoga Mat Cover", category: 'others', wash_fold: 35, wash_iron: 0, dry_clean: 80, steam_press: 0, starching: 0, alteration: 50 },
  { name: "Car Seat Cover", category: 'others', wash_fold: 80, wash_iron: 0, dry_clean: 180, steam_press: 0, starching: 0, alteration: 150 },
  { name: "Pet Bed Cover", category: 'others', wash_fold: 60, wash_iron: 0, dry_clean: 120, steam_press: 0, starching: 0, alteration: 80 },
  { name: "Umbrella Cover", category: 'others', wash_fold: 20, wash_iron: 0, dry_clean: 40, steam_press: 0, starching: 0, alteration: 30 },
]

async function seedCompletePricing() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')
    
    // Clear existing items
    await ServiceItem.deleteMany({})
    console.log('Cleared existing items')
    
    const allItems = []
    const services = ['wash_fold', 'wash_iron', 'dry_clean', 'steam_press', 'starching', 'alteration']
    
    for (const item of completeItems) {
      for (const service of services) {
        const price = item[service]
        if (price > 0) {
          allItems.push({
            name: item.name,
            itemId: `${item.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${service}`,
            service: service,
            category: item.category,
            basePrice: price,
            description: '',
            isActive: true,
            sortOrder: 0
          })
        }
      }
    }
    
    // Insert in batches
    const batchSize = 100
    for (let i = 0; i < allItems.length; i += batchSize) {
      const batch = allItems.slice(i, i + batchSize)
      await ServiceItem.insertMany(batch)
      console.log(`Inserted ${Math.min(i + batchSize, allItems.length)}/${allItems.length} items`)
    }
    
    console.log(`\n✅ Total items created: ${allItems.length}`)
    
    // Count by category
    const categories = ['men', 'women', 'kids', 'household', 'institutional', 'others']
    console.log('\nItems by category:')
    for (const cat of categories) {
      const count = completeItems.filter(i => i.category === cat).length
      console.log(`  - ${cat}: ${count} garments`)
    }
    
    console.log(`\nTotal unique garments: ${completeItems.length}`)
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
}

seedCompletePricing()
