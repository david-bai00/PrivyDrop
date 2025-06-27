import React from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import type { Messages } from "@/types/messages";

interface PageContentProps {
  messages: Messages;
}

export default function HowItWorks({ messages }: PageContentProps) {
  const steps = [
    {
      number: 1,
      title: messages!.text.HowItWorks.step1_title,
      description: messages!.text.HowItWorks.step1_description,
    },
    {
      number: 2,
      title: messages!.text.HowItWorks.step2_title,
      description: messages!.text.HowItWorks.step2_description,
    },
    {
      number: 3,
      title: messages!.text.HowItWorks.step3_title,
      description: messages!.text.HowItWorks.step3_description,
    },
  ];

  return (
    <section className="max-w-6xl mx-auto px-4 py-16">
      {/* Header Section */}
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold mb-6">
          {messages.text.HowItWorks.h2}
        </h2>
        <p className="text-gray-600 mb-8">{messages.text.HowItWorks.h2_P}</p>
        <Button className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-full px-8 py-6 text-lg">
          {messages.text.HowItWorks.btn_try}
        </Button>
      </div>

      {/* Steps Container */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-16">
        {/* Left Side - Steps */}
        <div className="w-full md:w-1/2 relative">
          {/* Vertical Line */}
          <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-blue-500"></div>

          {/* Steps List */}
          <div className="space-y-16">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-6 items-start">
                <div className="relative z-10">
                  <div
                    className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white 
                                text-xl font-bold shadow-md transition-transform hover:scale-105"
                  >
                    {step.number}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                  <p className="text-gray-600">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side - Demo Animation */}
        <div className="w-full md:w-1/2">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <video autoPlay loop muted playsInline width="1920" height="75">
              <source src="/HowItWorks.webm" type="video/webm" />
            </video>
          </div>
        </div>
      </div>
    </section>
  );
}
