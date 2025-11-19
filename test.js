function calculatePrice(basePrice, taxRate, discount) {
    var priceWithTax = basePrice * (1 + taxRate);
    var finalPrice = priceWithTax - discount;
    
    if (finalPrice < 0) {
        console.log("Warning: Final price is negative.");
    }

    return finalPrice;
}